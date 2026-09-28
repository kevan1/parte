alter table public.work_streams
  add column if not exists requester_type text,
  add column if not exists requester_name text,
  add column if not exists materials jsonb not null default '[]'::jsonb;

alter table public.work_streams
  drop constraint if exists chk_work_streams_requester_type;

alter table public.work_streams
  add constraint chk_work_streams_requester_type
  check (requester_type is null or requester_type in ('sector', 'line', 'person'));

alter table public.work_streams
  drop constraint if exists chk_work_streams_requester_name;

alter table public.work_streams
  add constraint chk_work_streams_requester_name
  check (requester_name is null or char_length(btrim(requester_name)) between 1 and 160);

alter table public.work_streams
  drop constraint if exists chk_work_streams_materials_array;

alter table public.work_streams
  add constraint chk_work_streams_materials_array
  check (jsonb_typeof(materials) = 'array');

create index if not exists idx_work_streams_user_status_requester
  on public.work_streams (user_id, status, updated_at desc);

grant insert (user_id, project_name, task_description, requester_type, requester_name, materials)
  on public.work_streams to authenticated;
