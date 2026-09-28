-- RPC-only writes keep server-owned dates and administrator authorization authoritative.
create schema if not exists availability_private;
revoke all on schema availability_private from public, anon, authenticated;
grant usage on schema availability_private to authenticated;

create table public.employee_work_schedules (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  weekdays integer[] not null check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[1,2,3,4,5,6,7]
    and array_position(weekdays, null) is null
  ),
  start_time time not null,
  end_time time not null,
  time_zone text not null,
  updated_at timestamptz not null default now(),
  check (start_time < end_time and end_time < time '24:00')
);
create table public.employee_availability_overrides (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('available', 'remote', 'absent')),
  local_date date,
  updated_at timestamptz not null default now(),
  check ((mode = 'available' and local_date is null) or (mode in ('remote', 'absent') and local_date is not null))
);
alter table public.employee_work_schedules enable row level security;
alter table public.employee_availability_overrides enable row level security;
revoke all on public.employee_work_schedules, public.employee_availability_overrides from public, anon, authenticated;
grant select on public.employee_work_schedules, public.employee_availability_overrides to authenticated;
create policy schedules_read_own on public.employee_work_schedules for select to authenticated using ((select auth.uid()) = user_id);
create policy availability_read_own on public.employee_availability_overrides for select to authenticated using ((select auth.uid()) = user_id);

create function availability_private.get_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'schedule', (select jsonb_build_object('userId', s.user_id, 'weekdays', s.weekdays,
      'startTime', to_char(s.start_time, 'HH24:MI'), 'endTime', to_char(s.end_time, 'HH24:MI'), 'timeZone', s.time_zone)
      from public.employee_work_schedules s where s.user_id = actor),
    'override', (select jsonb_build_object('mode', o.mode, 'date', o.local_date)
      from public.employee_availability_overrides o where o.user_id = actor),
    'isAdmin', exists(select 1 from public.profiles p where p.id = actor and p.role = 'admin')
  ) into result;
  return result;
end;
$$;
create function availability_private.set_override(p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); zone text; day date;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('available','remote','absent','automatic') then
    raise exception 'Invalid availability mode' using errcode = '22023';
  end if;
  if p_mode = 'automatic' then
    delete from public.employee_availability_overrides where user_id = actor;
  else
    if p_mode in ('remote','absent') then
      select time_zone into zone from public.employee_work_schedules where user_id = actor for share;
      if zone is null then raise exception 'Jornada sin configurar' using errcode = '22023'; end if;
      day := (statement_timestamp() at time zone zone)::date;
    end if;
    insert into public.employee_availability_overrides(user_id, mode, local_date)
    values (actor, p_mode, day)
    on conflict (user_id) do update set mode = excluded.mode, local_date = excluded.local_date, updated_at = now();
  end if;
  return availability_private.get_snapshot();
end;
$$;
create function availability_private.list_schedules() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email,
    'schedule', case when s.user_id is null then null else jsonb_build_object(
      'userId', s.user_id, 'weekdays', s.weekdays, 'startTime', to_char(s.start_time, 'HH24:MI'),
      'endTime', to_char(s.end_time, 'HH24:MI'), 'timeZone', s.time_zone) end) order by p.email), '[]'::jsonb)
    from public.profiles p left join public.employee_work_schedules s on s.user_id = p.id);
end;
$$;
create function availability_private.save_schedule(p_user_id uuid, p_weekdays integer[], p_start_time text, p_end_time text, p_time_zone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_weekdays is null or cardinality(p_weekdays) not between 1 and 7
    or not p_weekdays <@ array[1,2,3,4,5,6,7] or array_position(p_weekdays,null) is not null
    or (select count(distinct d) from unnest(p_weekdays) d) <> cardinality(p_weekdays)
    or p_start_time is null or p_end_time is null
    or p_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_start_time >= p_end_time
    or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Invalid work schedule' using errcode = '22023';
  end if;
  insert into public.employee_work_schedules(user_id, weekdays, start_time, end_time, time_zone)
  values(p_user_id, p_weekdays, p_start_time::time, p_end_time::time, p_time_zone)
  on conflict(user_id) do update set weekdays = excluded.weekdays, start_time = excluded.start_time,
    end_time = excluded.end_time, time_zone = excluded.time_zone, updated_at = now();
end;
$$;

-- Exposed wrappers are invokers; privileged implementations have explicit identity checks.
create function public.get_employee_availability() returns jsonb
language sql stable security invoker set search_path = '' as $$ select availability_private.get_snapshot(); $$;
create function public.set_employee_availability(p_mode text) returns jsonb
language sql security invoker set search_path = '' as $$ select availability_private.set_override(p_mode); $$;
create function public.list_employee_schedules() returns jsonb
language sql stable security invoker set search_path = '' as $$ select availability_private.list_schedules(); $$;
create function public.save_employee_schedule(p_user_id uuid, p_weekdays integer[], p_start_time text, p_end_time text, p_time_zone text) returns void
language sql security invoker set search_path = '' as $$ select availability_private.save_schedule(p_user_id,p_weekdays,p_start_time,p_end_time,p_time_zone); $$;
revoke all on all functions in schema availability_private from public, anon, authenticated;
grant execute on all functions in schema availability_private to authenticated;
revoke all on function public.get_employee_availability(), public.set_employee_availability(text), public.list_employee_schedules(), public.save_employee_schedule(uuid,integer[],text,text,text) from public, anon, authenticated;
grant execute on function public.get_employee_availability(), public.set_employee_availability(text), public.list_employee_schedules(), public.save_employee_schedule(uuid,integer[],text,text,text) to authenticated;
