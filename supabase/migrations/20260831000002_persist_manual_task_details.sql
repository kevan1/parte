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
    if v_draft->>'requesterType' is not null
       and v_draft->>'requesterType' not in ('sector', 'line', 'person') then
      raise exception 'requester type is invalid' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(v_draft->>'requesterName', ''))) > 160 then
      raise exception 'requester name is too long' using errcode = '22023';
    end if;
    if v_draft ? 'materials' and jsonb_typeof(v_draft->'materials') <> 'array' then
      raise exception 'materials must be an array' using errcode = '22023';
    end if;
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
      insert into public.work_streams (
        user_id,
        project_name,
        task_description,
        requester_type,
        requester_name,
        materials
      )
      values (
        v_user,
        btrim(v_draft->>'projectName'),
        btrim(v_draft->>'taskDescription'),
        nullif(btrim(v_draft->>'requesterType'), ''),
        nullif(btrim(v_draft->>'requesterName'), ''),
        coalesce(v_draft->'materials', '[]'::jsonb)
      )
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
