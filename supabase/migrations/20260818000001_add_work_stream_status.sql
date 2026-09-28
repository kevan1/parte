do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'work_stream_status' and n.nspname = 'public'
  ) then
    create type public.work_stream_status as enum ('open', 'completed');
  end if;
end
$$;

alter table public.work_streams
  add column if not exists status public.work_stream_status not null default 'open',
  add column if not exists completed_at timestamptz;

create index if not exists idx_work_streams_user_status_recent
  on public.work_streams (user_id, status, last_used_at desc);

create or replace function public.set_work_stream_status(
  p_work_stream_id uuid,
  p_status public.work_stream_status
)
returns setof public.work_streams
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_work_stream public.work_streams;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'status is required' using errcode = '22023';
  end if;

  update public.work_streams
     set status = p_status,
         completed_at = case when p_status = 'completed' then now() else null end,
         updated_at = now()
   where id = p_work_stream_id
     and user_id = auth.uid()
  returning * into v_work_stream;

  if v_work_stream.id is null then
    raise exception 'work stream is unavailable' using errcode = '42501';
  end if;
  return query select v_work_stream;
end;
$$;

revoke all on function public.set_work_stream_status(uuid, public.work_stream_status) from public, anon;
grant execute on function public.set_work_stream_status(uuid, public.work_stream_status) to authenticated;
