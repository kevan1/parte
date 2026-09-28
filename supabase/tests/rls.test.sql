begin;
select plan(10);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'work_streams', 'work_streams exists');
select has_table('public', 'time_entries', 'time_entries exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles RLS active'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.work_streams'::regclass),
  'work_streams RLS active'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.time_entries'::regclass),
  'time_entries RLS active'
);
select has_function('public', 'confirm_time_entries', array['uuid', 'jsonb']), 'confirmation RPC exists';
select has_function('public', 'consume_ai_quota', array[]::text[]), 'quota function exists';
select ok(
  not has_table_privilege('authenticated', 'public.time_entries', 'DELETE'),
  'employees cannot delete'
);
select ok(
  not has_table_privilege('anon', 'public.time_entries', 'SELECT'),
  'anonymous users cannot read'
);

select * from finish();
rollback;
