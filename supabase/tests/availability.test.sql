-- Covers AC-AV-2, AC-AV-4, AC-AV-7.
begin;
select plan(20);
insert into auth.users (id, email, role, aud, encrypted_password, email_confirmed_at)
values
('aaaaaa10-aaaa-4aaa-8aaa-aaaaaaaaaaaa','availability-admin@example.com','authenticated','authenticated','',now()),
('bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb','availability-worker@example.com','authenticated','authenticated','',now()),
('cccccc10-cccc-4ccc-8ccc-cccccccccccc','availability-other@example.com','authenticated','authenticated','',now());
update public.profiles set role = 'admin' where id = 'aaaaaa10-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select ok(not has_table_privilege('authenticated','public.employee_work_schedules','INSERT'), 'schedule direct writes denied');
select ok(not has_table_privilege('authenticated','public.employee_availability_overrides','INSERT'), 'override dates cannot be forged directly');
select ok(not has_function_privilege('anon','public.get_employee_availability()','EXECUTE'), 'anonymous RPC denied');
select ok((select relrowsecurity from pg_class where oid = 'public.employee_work_schedules'::regclass), 'schedule RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.employee_availability_overrides'::regclass), 'override RLS enabled');
set local role authenticated;
set local "request.jwt.claim.sub" = 'bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is(public.get_employee_availability()->'schedule', 'null'::jsonb, 'no default schedule');
select throws_ok($$select public.set_employee_availability('remote')$$,'22023','Jornada sin configurar','remote requires schedule');
select is(public.set_employee_availability('available')->'override', '{"mode":"available","date":null}'::jsonb, 'manual available needs no schedule or expiry');
select throws_ok($$select public.list_employee_schedules()$$,'42501','Administrator required','employee cannot list directory');
select throws_ok($$select public.save_employee_schedule('bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb',array[1,2,3,4,5],'08:00','17:00','America/Argentina/Buenos_Aires')$$,'42501','Administrator required','employee cannot edit schedule');
set local "request.jwt.claim.sub" = 'aaaaaa10-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select throws_ok($$select public.save_employee_schedule('bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb',array[1],'17:00','08:00','America/Argentina/Buenos_Aires')$$,'22023','Invalid work schedule','overnight schedule rejected');
select throws_ok($$select public.save_employee_schedule('bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb',array[1],'08:00','17:00','Invalid/Zone')$$,'22023','Invalid work schedule','unknown timezone rejected');
select throws_ok($$select public.save_employee_schedule('bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb',array[1,1],'08:00','17:00','UTC')$$,'22023','Invalid work schedule','duplicate weekdays rejected');
select lives_ok($$select public.save_employee_schedule('bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb',array[1,2,3,4,5],'08:00','17:00','America/Argentina/Buenos_Aires')$$,'admin configures explicit schedule');
set local "request.jwt.claim.sub" = 'bbbbbb10-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is(public.set_employee_availability('remote')->'override'->>'date',(statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date::text,'remote date comes from server in schedule zone');
select is(public.set_employee_availability('automatic')->'override','null'::jsonb,'automatic removes exception');
select is((select count(*) from public.time_entries),0::bigint,'availability changes do not create worked hours');
set local "request.jwt.claim.sub" = 'cccccc10-cccc-4ccc-8ccc-cccccccccccc';
select is((select count(*) from public.employee_work_schedules),0::bigint,'other employee cannot read schedule');
select is(public.get_employee_availability()->'schedule','null'::jsonb,'RPC always returns caller');
reset role;
update public.profiles set role = 'employee' where id = 'aaaaaa10-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaa10-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select throws_ok($$select public.list_employee_schedules()$$,'42501','Administrator required','revoked admin access takes effect immediately');
select * from finish();
rollback;
