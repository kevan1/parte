-- Rollback: drop schema assignment_private cascade; drop table public.device_push_tokens cascade;
-- No existing tables, policies, or rows are altered by this migration.

-- Enable pg_net for fire-and-forget HTTP calls from SQL.
create extension if not exists pg_net with schema extensions;

-- ──────────────────────────────────────────────────────────────────────────────
-- Private schema (mirrors availability_private pattern)
-- ──────────────────────────────────────────────────────────────────────────────
create schema if not exists assignment_private;
revoke all on schema assignment_private from public, anon, authenticated;
grant usage on schema assignment_private to authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- Device push token registry
-- ──────────────────────────────────────────────────────────────────────────────
create table public.device_push_tokens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  token       text        not null unique,
  platform    text        not null check (platform in ('ios', 'android', 'web')),
  updated_at  timestamptz not null default now()
);
create index idx_device_push_tokens_user on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

-- RPC-only writes: authenticated may only SELECT their own rows.
revoke all on public.device_push_tokens from public, anon, authenticated;
grant select on public.device_push_tokens to authenticated;

create policy tokens_select_own on public.device_push_tokens
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Private function: register token (upsert)
-- ──────────────────────────────────────────────────────────────────────────────
create function assignment_private.register_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'Invalid platform' using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$' then
    raise exception 'Invalid push token format' using errcode = '22023';
  end if;
  insert into public.device_push_tokens (user_id, token, platform)
  values (actor, p_token, p_platform)
  on conflict (token) do update
    set user_id = actor, updated_at = now();
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Private function: remove stale token (silent no-op if not found)
-- ──────────────────────────────────────────────────────────────────────────────
create function assignment_private.remove_stale_token(p_token text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  delete from public.device_push_tokens
  where token = p_token and user_id = actor;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Private function: assign task (admin only, inserts work_stream + push)
-- ──────────────────────────────────────────────────────────────────────────────
create function assignment_private.assign(
  p_assignee_id     uuid,
  p_project_name    text,
  p_task_description text,
  p_requester_type  text,
  p_requester_name  text,
  p_materials       jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor       uuid := auth.uid();
  new_id      uuid;
  tok         text;
  tok_count   int := 0;
  push_body   jsonb;
begin
  -- Guard: must be authenticated
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Guard: caller must be admin
  if not exists (
    select 1 from public.profiles where id = actor and role = 'admin'
  ) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;

  -- Guard: assignee must exist with role employee or admin
  if not exists (
    select 1 from public.profiles where id = p_assignee_id and role in ('employee', 'admin')
  ) then
    raise exception 'Invalid assignee' using errcode = '22023';
  end if;

  -- Validate project name (1–120 non-blank chars)
  if p_project_name is null or trim(p_project_name) = '' or length(trim(p_project_name)) > 120 then
    raise exception 'Invalid project name' using errcode = '22023';
  end if;

  -- Validate task description (1–500 chars)
  if p_task_description is null or trim(p_task_description) = '' or length(trim(p_task_description)) > 500 then
    raise exception 'Invalid task description' using errcode = '22023';
  end if;

  -- Validate optional requester type
  if p_requester_type is not null and p_requester_type not in ('sector', 'line', 'person') then
    raise exception 'Invalid requester type' using errcode = '22023';
  end if;

  -- Validate optional requester name
  if p_requester_name is not null and (trim(p_requester_name) = '' or length(trim(p_requester_name)) > 160) then
    raise exception 'Invalid requester name' using errcode = '22023';
  end if;

  -- Validate optional materials (must be jsonb array if provided)
  if p_materials is not null and jsonb_typeof(p_materials) <> 'array' then
    raise exception 'Invalid materials' using errcode = '22023';
  end if;

  -- Insert work_stream for the assignee
  insert into public.work_streams (
    user_id, project_name, task_description,
    requester_type, requester_name, materials
  )
  values (
    p_assignee_id,
    trim(p_project_name),
    trim(p_task_description),
    p_requester_type,
    p_requester_name,
    coalesce(p_materials, '[]'::jsonb)
  )
  returning id into new_id;

  -- Fire-and-forget push notification for each registered token
  for tok in
    select token from public.device_push_tokens where user_id = p_assignee_id
  loop
    tok_count := tok_count + 1;
    push_body := jsonb_build_object(
      'to',     tok,
      'title',  'Nueva tarea asignada',
      'body',   trim(p_project_name) || ' · ' || trim(p_task_description),
      'sound',  'default',
      'data',   jsonb_build_object(
                  'type',         'task-assignment',
                  'workStreamId', new_id
                )
    );
    begin
      -- pg_net exposes net.http_post; body must be jsonb. Failures must not abort the insert.
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := push_body,
        headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object(
    'workStreamId', new_id,
    'tokenCount',   tok_count
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Public wrapper RPCs (security invoker, explicit search_path = '')
-- ──────────────────────────────────────────────────────────────────────────────
create function public.register_device_token(p_token text, p_platform text)
returns void
language sql security invoker set search_path = ''
as $$ select assignment_private.register_token(p_token, p_platform); $$;

create function public.remove_stale_device_token(p_token text)
returns void
language sql security invoker set search_path = ''
as $$ select assignment_private.remove_stale_token(p_token); $$;

create function public.assign_task(
  p_assignee_id      uuid,
  p_project_name     text,
  p_task_description text,
  p_requester_type   text,
  p_requester_name   text,
  p_materials        jsonb
) returns jsonb
language sql security invoker set search_path = ''
as $$ select assignment_private.assign(p_assignee_id, p_project_name, p_task_description, p_requester_type, p_requester_name, p_materials); $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Permissions
-- ──────────────────────────────────────────────────────────────────────────────
revoke all on all functions in schema assignment_private from public, anon, authenticated;
grant execute on all functions in schema assignment_private to authenticated;

revoke all on function
  public.register_device_token(text, text),
  public.remove_stale_device_token(text),
  public.assign_task(uuid, text, text, text, text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.register_device_token(text, text),
  public.remove_stale_device_token(text),
  public.assign_task(uuid, text, text, text, text, jsonb)
to authenticated;
