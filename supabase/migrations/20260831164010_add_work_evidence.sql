create table if not exists public.work_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  work_stream_id uuid not null,
  source_asset_id text not null
    constraint chk_work_evidence_source_asset check (char_length(btrim(source_asset_id)) between 1 and 500),
  storage_path text not null unique,
  original_filename text,
  source_created_at timestamptz,
  mime_type text,
  byte_size integer constraint chk_work_evidence_byte_size check (byte_size is null or byte_size > 0),
  width integer constraint chk_work_evidence_width check (width is null or width > 0),
  height integer constraint chk_work_evidence_height check (height is null or height > 0),
  created_at timestamptz not null default now(),
  constraint fk_work_evidence_stream_owner
    foreign key (work_stream_id, user_id) references public.work_streams(id, user_id),
  constraint uq_work_evidence_source_per_stream unique (user_id, work_stream_id, source_asset_id)
);

create index if not exists idx_work_evidence_user_stream
  on public.work_evidence (user_id, work_stream_id, created_at desc);

alter table public.work_evidence enable row level security;

drop policy if exists work_evidence_select_own on public.work_evidence;
create policy work_evidence_select_own on public.work_evidence
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists work_evidence_insert_own on public.work_evidence;
create policy work_evidence_insert_own on public.work_evidence
for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.work_evidence from anon, authenticated;
grant select, insert on public.work_evidence to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-evidence',
  'work-evidence',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists work_evidence_storage_insert_own on storage.objects;
create policy work_evidence_storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'work-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists work_evidence_storage_select_own on storage.objects;
create policy work_evidence_storage_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'work-evidence'
  and (select auth.uid())::text = owner_id
);

drop policy if exists work_evidence_storage_update_own on storage.objects;
create policy work_evidence_storage_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'work-evidence'
  and (select auth.uid())::text = owner_id
)
with check (
  bucket_id = 'work-evidence'
  and (select auth.uid())::text = owner_id
);

drop policy if exists work_evidence_storage_delete_own on storage.objects;
create policy work_evidence_storage_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'work-evidence'
  and (select auth.uid())::text = owner_id
);
