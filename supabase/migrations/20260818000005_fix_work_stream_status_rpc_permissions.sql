revoke all on function public.set_work_stream_status(uuid, public.work_stream_status) from public, anon;
grant execute on function public.set_work_stream_status(uuid, public.work_stream_status) to authenticated;
