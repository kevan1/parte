create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id),
  email text not null,
  role text not null default 'employee'
    constraint chk_profiles_role check (role in ('employee', 'admin', 'external')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_name text not null
    constraint chk_work_streams_project check (char_length(btrim(project_name)) between 1 and 120),
  task_description text not null
    constraint chk_work_streams_task check (char_length(btrim(task_description)) between 1 and 500),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_work_streams_id_user unique (id, user_id)
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  work_stream_id uuid not null,
  submission_id uuid not null,
  client_id uuid not null,
  work_date date not null,
  duration_minutes integer not null
    constraint chk_time_entries_duration check (duration_minutes between 1 and 1440),
  start_time time(0),
  end_time time(0),
  project_name text not null
    constraint chk_time_entries_project check (char_length(btrim(project_name)) between 1 and 120),
  task_description text not null
    constraint chk_time_entries_task check (char_length(btrim(task_description)) between 1 and 500),
  notes text constraint chk_time_entries_notes check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_time_entries_stream_owner
    foreign key (work_stream_id, user_id) references public.work_streams(id, user_id),
  constraint chk_time_entries_times_present check ((start_time is null) = (end_time is null)),
  constraint chk_time_entries_time_order check (start_time is null or start_time < end_time),
  constraint chk_time_entries_time_duration check (
    start_time is null or end_time - start_time = duration_minutes * interval '1 minute'
  ),
  constraint uq_time_entries_submission_client unique (user_id, submission_id, client_id)
);

create table if not exists private.ai_user_usage_daily (
  usage_date date not null,
  user_id uuid not null references auth.users(id),
  request_count integer not null constraint chk_ai_user_usage_count check (request_count >= 0),
  primary key (usage_date, user_id)
);

create table if not exists private.ai_global_usage_daily (
  usage_date date primary key,
  request_count integer not null constraint chk_ai_global_usage_count check (request_count >= 0)
);

create index if not exists idx_work_streams_user_recent
  on public.work_streams (user_id, last_used_at desc);
create index if not exists idx_time_entries_user_date
  on public.time_entries (user_id, work_date desc);
create index if not exists idx_time_entries_user_stream_date
  on public.time_entries (user_id, work_stream_id, work_date desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.prevent_identity_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.submission_id <> old.submission_id
     or new.client_id <> old.client_id then
    raise exception 'immutable time entry identity' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.validate_time_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing integer;
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if new.work_date > v_today then
    raise exception 'future dates are not allowed' using errcode = '22007';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':' || new.work_date::text, 0)
  );

  select coalesce(sum(duration_minutes), 0)::integer
    into v_existing
    from public.time_entries
   where user_id = new.user_id
     and work_date = new.work_date
     and id <> new.id;

  if v_existing + new.duration_minutes > 1440 then
    raise exception 'daily total cannot exceed 24 hours' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function private.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists work_streams_set_updated_at on public.work_streams;
create trigger work_streams_set_updated_at
before update on public.work_streams
for each row execute function private.set_updated_at();

drop trigger if exists time_entries_prevent_identity_change on public.time_entries;
create trigger time_entries_prevent_identity_change
before update on public.time_entries
for each row execute function private.prevent_identity_change();

drop trigger if exists time_entries_validate on public.time_entries;
create trigger time_entries_validate
before insert or update on public.time_entries
for each row execute function private.validate_time_entry();

drop trigger if exists time_entries_set_updated_at on public.time_entries;
create trigger time_entries_set_updated_at
before update on public.time_entries
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.work_streams enable row level security;
alter table public.time_entries enable row level security;
alter table private.ai_user_usage_daily enable row level security;
alter table private.ai_global_usage_daily enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists work_streams_select_own on public.work_streams;
create policy work_streams_select_own on public.work_streams
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists work_streams_insert_own on public.work_streams;
create policy work_streams_insert_own on public.work_streams
for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists work_streams_update_own on public.work_streams;
create policy work_streams_update_own on public.work_streams
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists time_entries_select_own on public.time_entries;
create policy time_entries_select_own on public.time_entries
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists time_entries_insert_own on public.time_entries;
create policy time_entries_insert_own on public.time_entries
for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists time_entries_update_own on public.time_entries;
create policy time_entries_update_own on public.time_entries
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.work_streams, public.time_entries from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.work_streams to authenticated;
grant insert (user_id, project_name, task_description, last_used_at)
  on public.work_streams to authenticated;
grant update (project_name, task_description, last_used_at)
  on public.work_streams to authenticated;
grant select on public.time_entries to authenticated;
grant insert (
  user_id, work_stream_id, submission_id, client_id, work_date, duration_minutes,
  start_time, end_time, project_name, task_description, notes
) on public.time_entries to authenticated;
grant update (
  work_stream_id, work_date, duration_minutes, start_time, end_time,
  project_name, task_description, notes
) on public.time_entries to authenticated;

create or replace function public.consume_ai_quota()
returns table (allowed boolean, user_remaining integer, global_remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_date date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_user_count integer;
  v_global_count integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-global:' || v_date::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || v_user::text || ':' || v_date::text, 0));

  select request_count into v_global_count
    from private.ai_global_usage_daily where usage_date = v_date;
  select request_count into v_user_count
    from private.ai_user_usage_daily where usage_date = v_date and user_id = v_user;
  v_global_count := coalesce(v_global_count, 0);
  v_user_count := coalesce(v_user_count, 0);

  if v_user_count >= 50 or v_global_count >= 500 then
    return query select false, greatest(50 - v_user_count, 0), greatest(500 - v_global_count, 0);
    return;
  end if;

  insert into private.ai_global_usage_daily (usage_date, request_count)
  values (v_date, 1)
  on conflict (usage_date) do update
    set request_count = private.ai_global_usage_daily.request_count + 1;
  insert into private.ai_user_usage_daily (usage_date, user_id, request_count)
  values (v_date, v_user, 1)
  on conflict (usage_date, user_id) do update
    set request_count = private.ai_user_usage_daily.request_count + 1;

  return query select true, 49 - v_user_count, 499 - v_global_count;
end;
$$;

create or replace function public.confirm_time_entries(
  p_submission_id uuid,
  p_drafts jsonb
)
returns setof public.time_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_draft jsonb;
  v_stream_id uuid;
  v_count integer;
  v_work_date date;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_drafts) <> 'array' then
    raise exception 'drafts must be an array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_drafts);
  if v_count < 1 or v_count > 10 then
    raise exception 'draft batch must contain 1 to 10 entries' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':submission:' || p_submission_id::text, 0));
  if exists (
    select 1 from public.time_entries
    where user_id = v_user and submission_id = p_submission_id
  ) then
    return query
      select * from public.time_entries
      where user_id = v_user and submission_id = p_submission_id
      order by created_at, client_id;
    return;
  end if;

  -- Parse and validate the complete payload before any write.
  for v_draft in select value from jsonb_array_elements(p_drafts)
  loop
    if nullif(btrim(v_draft->>'projectName'), '') is null
       or nullif(btrim(v_draft->>'taskDescription'), '') is null
       or (v_draft->>'clientId') is null
       or (v_draft->>'workDate') is null
       or (v_draft->>'durationMinutes') is null then
      raise exception 'draft is missing required fields' using errcode = '22023';
    end if;
    perform (v_draft->>'clientId')::uuid;
    v_work_date := (v_draft->>'workDate')::date;
    perform (v_draft->>'durationMinutes')::integer;
    if v_draft->>'selectedWorkStreamId' is not null and not exists (
      select 1 from public.work_streams
      where id = (v_draft->>'selectedWorkStreamId')::uuid and user_id = v_user
    ) then
      raise exception 'work stream is unavailable' using errcode = '42501';
    end if;
  end loop;

  -- Acquire date locks in deterministic order before inserting the batch.
  for v_work_date in
    select distinct (value->>'workDate')::date
    from jsonb_array_elements(p_drafts)
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_work_date::text, 0));
  end loop;

  for v_draft in select value from jsonb_array_elements(p_drafts)
  loop
    v_stream_id := nullif(v_draft->>'selectedWorkStreamId', '')::uuid;
    if v_stream_id is null then
      insert into public.work_streams (user_id, project_name, task_description)
      values (v_user, btrim(v_draft->>'projectName'), btrim(v_draft->>'taskDescription'))
      returning id into v_stream_id;
    end if;

    update public.work_streams set last_used_at = now()
    where id = v_stream_id and user_id = v_user;

    insert into public.time_entries (
      user_id, work_stream_id, submission_id, client_id, work_date,
      duration_minutes, start_time, end_time, project_name, task_description, notes
    ) values (
      v_user,
      v_stream_id,
      p_submission_id,
      (v_draft->>'clientId')::uuid,
      (v_draft->>'workDate')::date,
      (v_draft->>'durationMinutes')::integer,
      nullif(v_draft->>'startTime', '')::time,
      nullif(v_draft->>'endTime', '')::time,
      btrim(v_draft->>'projectName'),
      btrim(v_draft->>'taskDescription'),
      nullif(btrim(v_draft->>'notes'), '')
    );
  end loop;

  return query
    select * from public.time_entries
    where user_id = v_user and submission_id = p_submission_id
    order by created_at, client_id;
end;
$$;

create or replace function public.update_time_entry(
  p_entry_id uuid,
  p_work_stream_id uuid,
  p_create_new_stream boolean,
  p_work_date date,
  p_duration_minutes integer,
  p_start_time time,
  p_end_time time,
  p_project_name text,
  p_task_description text,
  p_notes text
)
returns setof public.time_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_stream_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.time_entries where id = p_entry_id and user_id = v_user
  ) then
    raise exception 'time entry is unavailable' using errcode = '42501';
  end if;
  if p_create_new_stream then
    insert into public.work_streams (user_id, project_name, task_description)
    values (v_user, btrim(p_project_name), btrim(p_task_description))
    returning id into v_stream_id;
  else
    v_stream_id := p_work_stream_id;
    if v_stream_id is null or not exists (
      select 1 from public.work_streams where id = v_stream_id and user_id = v_user
    ) then
      raise exception 'work stream is unavailable' using errcode = '42501';
    end if;
  end if;

  return query
    update public.time_entries
       set work_stream_id = v_stream_id,
           work_date = p_work_date,
           duration_minutes = p_duration_minutes,
           start_time = p_start_time,
           end_time = p_end_time,
           project_name = btrim(p_project_name),
           task_description = btrim(p_task_description),
           notes = nullif(btrim(p_notes), '')
     where id = p_entry_id and user_id = v_user
    returning *;
end;
$$;

revoke all on function public.consume_ai_quota() from public, anon;
revoke all on function public.confirm_time_entries(uuid, jsonb) from public, anon;
revoke all on function public.update_time_entry(uuid, uuid, boolean, date, integer, time, time, text, text, text) from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
grant execute on function public.confirm_time_entries(uuid, jsonb) to authenticated;
grant execute on function public.update_time_entry(uuid, uuid, boolean, date, integer, time, time, text, text, text) to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
