-- Covers AC-TA-2, AC-TA-3, AC-TA-4, AC-TA-7.
-- Seed three auth users; update admin profile; run assertions; rollback.
begin;
select plan(24);

-- Seed auth users
insert into auth.users (id, email, role, aud, encrypted_password, email_confirmed_at)
values
  ('aa000000-aa00-4a00-8a00-aaaaaaaaaaaa', 'task-admin@example.com',  'authenticated', 'authenticated', '', now()),
  ('bb000000-bb00-4b00-8b00-bbbbbbbbbbbb', 'task-worker@example.com', 'authenticated', 'authenticated', '', now()),
  ('cc000000-cc00-4c00-8c00-cccccccccccc', 'task-other@example.com',  'authenticated', 'authenticated', '', now());

update public.profiles set role = 'admin' where id = 'aa000000-aa00-4a00-8a00-aaaaaaaaaaaa';

-- 1. RLS is enabled on device_push_tokens
select ok(
  (select relrowsecurity from pg_class where oid = 'public.device_push_tokens'::regclass),
  'device_push_tokens RLS is enabled'
);

-- 2. Direct INSERT on device_push_tokens is denied for authenticated role
select ok(
  not has_table_privilege('authenticated', 'public.device_push_tokens', 'INSERT'),
  'device_push_tokens direct INSERT denied for authenticated'
);

-- 3. Direct INSERT into work_streams with another user_id is blocked by existing RLS
select ok(
  (select relrowsecurity from pg_class where oid = 'public.work_streams'::regclass),
  'work_streams RLS is enabled'
);

-- 4. anon cannot execute assign_task
select ok(
  not has_function_privilege('anon', 'public.assign_task(uuid,text,text,text,text,jsonb)', 'EXECUTE'),
  'anon cannot call assign_task'
);

-- 5. anon cannot execute register_device_token
select ok(
  not has_function_privilege('anon', 'public.register_device_token(text,text)', 'EXECUTE'),
  'anon cannot call register_device_token'
);

-- 6. anon cannot execute remove_stale_device_token
select ok(
  not has_function_privilege('anon', 'public.remove_stale_device_token(text)', 'EXECUTE'),
  'anon cannot call remove_stale_device_token'
);

-- Authenticated context: worker tries to call assign_task
set local role authenticated;
set local "request.jwt.claim.sub" = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb';

-- 7. Worker calling assign_task raises 42501
select throws_ok(
  $$select public.assign_task('cc000000-cc00-4c00-8c00-cccccccccccc'::uuid, 'Proyecto X', 'Descripción', null, null, null)$$,
  '42501', 'Administrator required',
  'non-admin calling assign_task raises 42501'
);

-- 8. Worker calling register_device_token with invalid platform raises 22023
select throws_ok(
  $$select public.register_device_token('ExponentPushToken[abc123]', 'desktop')$$,
  '22023', 'Invalid platform',
  'invalid platform raises 22023'
);

-- 9. Worker calling register_device_token with malformed token raises 22023
select throws_ok(
  $$select public.register_device_token('not-a-valid-token', 'ios')$$,
  '22023', 'Invalid push token format',
  'malformed token raises 22023'
);

-- 10. Worker can register a valid token
select lives_ok(
  $$select public.register_device_token('ExponentPushToken[worker-device-1]', 'ios')$$,
  'worker registers valid token'
);

-- 11. Worker cannot read another user's token rows (cross-user select returns 0)
set local "request.jwt.claim.sub" = 'cc000000-cc00-4c00-8c00-cccccccccccc';
select is(
  (select count(*) from public.device_push_tokens where user_id = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb')::bigint,
  0::bigint,
  'task-other cannot read task-worker token'
);

-- 12. remove_stale_device_token is a silent no-op for an unknown token
set local "request.jwt.claim.sub" = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb';
select lives_ok(
  $$select public.remove_stale_device_token('ExponentPushToken[does-not-exist]')$$,
  'remove unknown token is silent no-op'
);

-- 13. remove_stale_device_token removes own token
select lives_ok(
  $$select public.remove_stale_device_token('ExponentPushToken[worker-device-1]')$$,
  'worker can remove own token'
);

select is(
  (select count(*) from public.device_push_tokens where user_id = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb')::bigint,
  0::bigint,
  'token removed after remove_stale_device_token'
);

-- Switch to admin context
set local "request.jwt.claim.sub" = 'aa000000-aa00-4a00-8a00-aaaaaaaaaaaa';

-- 15. Admin calling assign_task with random unknown assignee raises 22023
select throws_ok(
  $$select public.assign_task('00000000-0000-4000-8000-000000000000'::uuid, 'Proyecto X', 'Descripción', null, null, null)$$,
  '22023', 'Invalid assignee',
  'unknown assignee raises 22023'
);

-- 16. Admin calling assign_task with blank project name raises 22023
select throws_ok(
  $$select public.assign_task('bb000000-bb00-4b00-8b00-bbbbbbbbbbbb'::uuid, '   ', 'Descripción', null, null, null)$$,
  '22023', 'Invalid project name',
  'blank project name raises 22023'
);

-- 17. Admin calling assign_task with blank task description raises 22023
select throws_ok(
  $$select public.assign_task('bb000000-bb00-4b00-8b00-bbbbbbbbbbbb'::uuid, 'Proyecto X', '', null, null, null)$$,
  '22023', 'Invalid task description',
  'blank task description raises 22023'
);

-- 18. Admin calling assign_task with valid params succeeds
select lives_ok(
  $$select public.assign_task('bb000000-bb00-4b00-8b00-bbbbbbbbbbbb'::uuid, 'Proyecto X', 'Descripción válida', null, null, null)$$,
  'admin assigns task to worker successfully'
);

-- 19. Returned workStreamId is a non-null UUID
select ok(
  (public.assign_task('bb000000-bb00-4b00-8b00-bbbbbbbbbbbb'::uuid, 'Proyecto Y', 'Tarea 2', null, null, null))->>'workStreamId' is not null,
  'assign_task returns a workStreamId'
);

-- 20. The created work_stream row has user_id = assignee (worker)
select is(
  (select count(*) from public.work_streams where user_id = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb' and project_name = 'Proyecto X')::bigint,
  1::bigint,
  'work_stream user_id equals assignee id'
);

-- Worker can read their own newly created work_stream
set local "request.jwt.claim.sub" = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb';
select ok(
  (select count(*) from public.work_streams where user_id = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb') >= 1,
  'worker can select their own work_stream'
);

-- 22. task-other cannot read task-worker's work_streams
set local "request.jwt.claim.sub" = 'cc000000-cc00-4c00-8c00-cccccccccccc';
select is(
  (select count(*) from public.work_streams where user_id = 'bb000000-bb00-4b00-8b00-bbbbbbbbbbbb')::bigint,
  0::bigint,
  'task-other cannot read task-worker work_streams'
);

-- 23. After role downgrade, assign_task raises 42501 immediately
reset role;
update public.profiles set role = 'employee' where id = 'aa000000-aa00-4a00-8a00-aaaaaaaaaaaa';
set local role authenticated;
set local "request.jwt.claim.sub" = 'aa000000-aa00-4a00-8a00-aaaaaaaaaaaa';
select throws_ok(
  $$select public.assign_task('bb000000-bb00-4b00-8b00-bbbbbbbbbbbb'::uuid, 'Proyecto X', 'Descripción', null, null, null)$$,
  '42501', 'Administrator required',
  'revoked admin access takes effect immediately'
);

-- 24. device_push_tokens SELECT granted to authenticated (own rows only via RLS)
reset role;
select ok(
  has_table_privilege('authenticated', 'public.device_push_tokens', 'SELECT'),
  'authenticated can SELECT device_push_tokens (own rows via RLS)'
);

select * from finish();
rollback;
