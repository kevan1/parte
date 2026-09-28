begin;
select plan(12);

insert into auth.users (id, email, role, aud, encrypted_password, email_confirmed_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.com', 'authenticated', 'authenticated', '', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.com', 'authenticated', 'authenticated', '', now());

insert into public.work_streams (id, user_id, project_name, task_description)
values ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Proyecto B', 'Tarea B');

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local "request.jwt.claim.role" = 'authenticated';

select lives_ok(
  $$
    select * from public.confirm_time_entries(
      '33333333-3333-4333-8333-333333333333',
      jsonb_build_array(
        jsonb_build_object(
          'clientId', '44444444-4444-4444-8444-444444444444',
          'workDate', current_date::text,
          'durationMinutes', 60,
          'startTime', null,
          'endTime', null,
          'projectName', 'Horas',
          'taskDescription', 'Primera tarea',
          'notes', null,
          'selectedWorkStreamId', null
        ),
        jsonb_build_object(
          'clientId', '55555555-5555-4555-8555-555555555555',
          'workDate', current_date::text,
          'durationMinutes', 90,
          'startTime', null,
          'endTime', null,
          'projectName', 'Horas',
          'taskDescription', 'Segunda tarea',
          'notes', null,
          'selectedWorkStreamId', null
        )
      )
    )
  $$,
  'a valid multi-entry batch is committed atomically'
);

select is(
  (select count(*) from public.time_entries where submission_id = '33333333-3333-4333-8333-333333333333'),
  2::bigint,
  'both batch entries persisted'
);

select is(
  (
    select count(*) from public.confirm_time_entries(
      '33333333-3333-4333-8333-333333333333',
      jsonb_build_array(jsonb_build_object('ignored', true))
    )
  ),
  2::bigint,
  'repeating a submission returns original rows'
);

select is(
  (select count(*) from public.time_entries where submission_id = '33333333-3333-4333-8333-333333333333'),
  2::bigint,
  'repeating a submission creates no duplicates'
);

select throws_ok(
  $$
    select * from public.confirm_time_entries(
      '66666666-6666-4666-8666-666666666666',
      jsonb_build_array(
        jsonb_build_object(
          'clientId', '77777777-7777-4777-8777-777777777777',
          'workDate', current_date::text,
          'durationMinutes', 60,
          'projectName', 'Horas',
          'taskDescription', 'Válida'
        ),
        jsonb_build_object('clientId', '88888888-8888-4888-8888-888888888888')
      )
    )
  $$,
  '22023',
  null,
  'a malformed line aborts the whole batch'
);

select is(
  (select count(*) from public.time_entries where submission_id = '66666666-6666-4666-8666-666666666666'),
  0::bigint,
  'failed batch persisted no partial entry'
);

select throws_ok(
  $$
    select * from public.confirm_time_entries(
      '99999999-9999-4999-8999-999999999999',
      jsonb_build_array(
        jsonb_build_object(
          'clientId', '10101010-1010-4010-8010-101010101010',
          'workDate', current_date::text,
          'durationMinutes', 30,
          'startTime', null,
          'endTime', null,
          'projectName', 'Proyecto B',
          'taskDescription', 'Tarea B',
          'notes', null,
          'selectedWorkStreamId', '22222222-2222-4222-8222-222222222222'
        )
      )
    )
  $$,
  '42501',
  null,
  'confirmation rejects a foreign work stream'
);

do $$
begin
  for counter in 1..50 loop
    perform * from public.consume_ai_quota();
  end loop;
end;
$$;

select is(
  (select allowed from public.consume_ai_quota()),
  false,
  'the 51st daily AI request is denied before model use'
);

select lives_ok(
  $$
    select * from public.update_time_entry(
      (select id from public.time_entries where submission_id = '33333333-3333-4333-8333-333333333333' limit 1),
      null,
      true,
      current_date,
      45,
      null,
      null,
      'Horas renovado',
      'Tarea renovada',
      null
    )
  $$,
  'editing can explicitly create a new continuity stream'
);

select is(
  (select project_name from public.time_entries where submission_id = '33333333-3333-4333-8333-333333333333' order by created_at limit 1),
  'Horas renovado',
  'structured edit persists through the RLS-scoped RPC'
);

select throws_ok(
  $$
    select * from public.update_time_entry(
      '12121212-1212-4212-8212-121212121212',
      null,
      true,
      current_date,
      30,
      null,
      null,
      'No crear',
      'Entrada ajena o inexistente',
      null
    )
  $$,
  '42501',
  null,
  'editing an unavailable entry is rejected before creating a stream'
);

select is(
  (select count(*) from public.work_streams where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  3::bigint,
  'a rejected edit leaves no orphan work stream'
);

select * from finish();
rollback;
