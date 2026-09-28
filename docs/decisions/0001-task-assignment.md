# 0001. Assignment authorization and push delivery via security-definer RPC + pg_net

**Date**: 2026-09-14
**Status**: Proposed

## Context

Task assignment requires two privileged operations that cannot be performed by an authenticated mobile client under the current RLS model:

1. **Cross-user work_stream creation.** The existing `work_streams_insert_own` policy requires `auth.uid() = user_id`. An admin assigning a task to an employee must insert a row with the employee's `user_id`. Doing this directly from the client would require either removing the policy (weakens employee data isolation) or using the service-role key (must never be in the mobile bundle).

2. **Server-side push notification.** The admin device must not hold the employee's Expo push token. The token must be fetched from the server and the push call must originate there so the mobile bundle never sees another user's token. Expo's standard Push API (`https://exp.host/--/api/v2/push/send`) requires no server secret for basic unauthenticated sends; only the token (which is not a credential) is needed.

The question is which server-side mechanism to use: a Supabase security-definer RPC (possibly using the `pg_net` extension for the HTTP call), or a Supabase Edge Function.

Supabase `pg_net` provides an asynchronous, non-blocking HTTP request mechanism directly from SQL. This means the Expo Push API call can be made inside the same database transaction that creates the task, but because `pg_net` is async the push is fire-and-forget: a push failure cannot roll back the committed task insert. This satisfies the spec requirement that push failure must never block or reverse task creation.

The project already uses security-definer RPCs for the availability schedule feature (`assignment_private` mirrors `availability_private`). No Edge Functions are currently deployed or required by any existing feature.

## Decision

Use a security-definer RPC `assign_task` in a private schema `assignment_private`. The RPC:
- Verifies the caller has `profiles.role = 'admin'`.
- Inserts the `work_stream` with `user_id` equal to the assignee.
- Collects the assignee's tokens from `device_push_tokens`.
- Calls `pg_net.http_post` for each token to the Expo Push API. The call is fire-and-forget (`pg_net` is asynchronous by default).
- Returns the created `work_stream` id and the token count (zero means no devices registered).

The mobile client never receives or stores another user's token. The Expo Push API requires no secret for standard sends; no privileged credential enters the mobile bundle, the RPC body, or application logs.

## Consequences

**Easier:**
- Consistent with the existing security-definer pattern; no new infrastructure (no Edge Function, no Deno runtime, no additional secrets management).
- Push failure is automatically decoupled from task creation without any extra transaction-splitting logic.
- The migration is a single SQL file; deployment is `supabase db push`.
- The Expo Push API call can be extended to include `channelId`, `sound`, and `data` fields without changing client code.
- Token count in the RPC return value lets the calling screen warn the admin when no device is registered.

**Harder:**
- `pg_net` must be enabled on the production project. If it is not, the migration must be adjusted to omit the HTTP call and route through an Edge Function instead (see Alternatives). Verify with `select name, installed_version from pg_available_extensions where name = 'pg_net';` before deploying.
- Expo `pg_net` receipts cannot be checked from the same RPC (asynchronous). If receipt polling becomes necessary, it requires a separate RPC or Edge Function.
- Migrating to Expo Enhanced Push Authentication (which signs requests with a server token) will require moving the HTTP call to an Edge Function so the signing secret is held in an environment variable and never persists in the database.

**Risks accepted:**
- Best-effort push: if `pg_net` fails silently (network error, Expo service down) the admin sees no warning beyond the "no tokens" case. This is acceptable for the first slice; push receipt polling is a non-goal.
- Token reassignment edge case: if a user reinstalls the app and their old token is reassigned by APNs to a different user, the ON CONFLICT upsert in `register_device_token` silently re-claims the token. In practice Expo tokens are app-specific and not reassigned to different users; APNs device tokens underneath can rotate but Expo abstracts that.

## Alternatives considered

**A — Supabase Edge Function with Database Webhook:**
After the `assign_task` RPC commits the work_stream, a trigger fires a webhook to a Supabase Edge Function. The Edge Function reads tokens and calls Expo Push API. This completely decouples push from the RPC, enables Easy Enhanced Auth by storing a secret in the Edge Function environment, and supports receipt polling.

Rejected for this slice because: it introduces Deno/Edge Function infrastructure the project does not yet use; it requires a separate deployment step beyond the migration; and the decoupling benefit is already achieved by `pg_net`'s async semantics. The ADR will be revisited when Enhanced Push Authentication is adopted.

**B — Client-side push after server confirmation:**
The assignment RPC returns the created task. The client app then fetches the assignee's token (via a separate admin RPC) and posts to Expo Push API directly.

Rejected because: it requires the client to hold another user's token in memory, which violates the stated security constraint. It also ties push success to client-side network conditions.

**C — Supabase Realtime subscription on the employee device:**
The employee's device subscribes to a Realtime channel for their `work_streams` table. When a new row is inserted the device receives the change and can display a local notification.

Rejected because: it requires a persistent WebSocket connection; battery and background-mode constraints on iOS make this unreliable for alert-class notifications. APNs push (via Expo) is the appropriate mechanism for background alerts on iOS.
