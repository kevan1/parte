begin;
select plan(11);

insert into auth.users (id, email, role, aud, encrypted_password, email_confirmed_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.com', 'authenticated', 'authenticated', '', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.com', 'authenticated', 'authenticated', '', now());

insert into public.work_streams (id, user_id, project_name, task_description)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Proyecto A', 'Tarea A'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Proyecto B', 'Tarea B');

insert into public.time_entries (
  id, user_id, work_stream_id, submission_id, client_id, work_date,
  duration_minutes, project_name, task_description
)
values
  (
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    current_date,
    60,
    'Proyecto A',
    'Tarea A'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    '77777777-7777-4777-8777-777777777777',
    '88888888-8888-4888-8888-888888888888',
    current_date,
    60,
    'Proyecto B',
    'Tarea B'
  );

insert into public.work_evidence (
  id, user_id, work_stream_id, source_asset_id, storage_path,
  original_filename, mime_type, byte_size, width, height
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'ph://asset-a',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/photo.jpg',
    'photo-a.jpg',
    'image/jpeg',
    1024,
    1200,
    900
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'ph://asset-b',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/22222222-2222-4222-8222-222222222222/photo.jpg',
    'photo-b.jpg',
    'image/jpeg',
    1024,
    1200,
    900
  );

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local "request.jwt.claim.role" = 'authenticated';

select is((select count(*) from public.work_streams), 1::bigint, 'user A sees only own streams');
select is((select count(*) from public.time_entries), 1::bigint, 'user A sees only own entries');
select is((select count(*) from public.work_evidence), 1::bigint, 'user A sees only own evidence');

select lives_ok(
  $$
    insert into public.time_entries (
      user_id, work_stream_id, submission_id, client_id, work_date,
      duration_minutes, project_name, task_description
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      '99999999-9999-4999-8999-999999999999',
      '10101010-1010-4010-8010-101010101010',
      current_date,
      30,
      'Proyecto A',
      'Tarea propia'
    )
  $$,
  'user A can insert an own entry'
);

select throws_ok(
  $$
    insert into public.time_entries (
      user_id, work_stream_id, submission_id, client_id, work_date,
      duration_minutes, project_name, task_description
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      '12121212-1212-4212-8212-121212121212',
      '13131313-1313-4313-8313-131313131313',
      current_date,
      30,
      'Proyecto B',
      'Entrada ajena'
    )
  $$,
  '42501',
  null,
  'user A cannot insert for user B'
);

select results_eq(
  $$
    update public.time_entries
       set task_description = 'No permitido'
     where id = '66666666-6666-4666-8666-666666666666'
    returning id
  $$,
  array[]::uuid[],
  'user A cannot update user B entry'
);

select throws_ok(
  $$ delete from public.time_entries where id = '33333333-3333-4333-8333-333333333333' $$,
  '42501',
  null,
  'employees cannot delete entries'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  'employees cannot update profile role'
);

select ok(
  not has_column_privilege('authenticated', 'public.time_entries', 'user_id', 'UPDATE'),
  'employees cannot change entry ownership'
);

select throws_ok(
  $$
    insert into public.time_entries (
      user_id, work_stream_id, submission_id, client_id, work_date,
      duration_minutes, project_name, task_description
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      '14141414-1414-4414-8414-141414141414',
      '15151515-1515-4515-8515-151515151515',
      current_date,
      30,
      'Proyecto B',
      'Vínculo ajeno'
    )
  $$,
  '23503',
  null,
  'composite foreign key rejects a foreign work stream'
);

select throws_ok(
  $$
    insert into public.work_evidence (
      user_id, work_stream_id, source_asset_id, storage_path
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'ph://asset-forbidden',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/22222222-2222-4222-8222-222222222222/forbidden.jpg'
    )
  $$,
  '23503',
  null,
  'composite foreign key rejects evidence for a foreign work stream'
);

select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) $$,
  'user A sees only own profile'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous users have no profile read access'
);

select * from finish();
rollback;
