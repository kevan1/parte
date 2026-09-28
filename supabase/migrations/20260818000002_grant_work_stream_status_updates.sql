update public.work_streams
set status = 'open'::public.work_stream_status
where status is null;

alter table public.work_streams
  alter column status set default 'open'::public.work_stream_status,
  alter column status set not null;

grant update (status, completed_at) on public.work_streams to authenticated;
