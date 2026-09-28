import type {
  CaptureTurn,
  EditableTimeEntryDraft,
  ExtractResponse,
  LocalEvidenceAttachment,
  TimeEntry,
  TaskRequesterType,
  WorkStream,
} from '@/domain/types';
import { supabase } from '@/data/supabase';
import { RepositoryError } from '@/data/repository-error';
import { persistWorkEvidence } from '@/data/work-evidence-repository';

export { RepositoryError } from '@/data/repository-error';

type FunctionErrorBody = {
  code?: string;
  message?: string;
  retryable?: boolean;
};

async function decodeFunctionError(error: unknown): Promise<RepositoryError> {
  const message = error instanceof Error ? error.message : null;
  if (message && /name resolution|ENOTFOUND|EAI_AGAIN|DNS|Could not resolve|resolve host/i.test(message)) {
    return new RepositoryError(
      'NETWORK_ERROR',
      'No se pudo resolver el host del backend. Revisá EXPO_PUBLIC_SUPABASE_URL y tu conexión.',
      true,
    );
  }

  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as FunctionErrorBody;
      return new RepositoryError(
        body.code ?? 'FUNCTION_ERROR',
        body.message ?? 'No pudimos procesar la solicitud.',
        Boolean(body.retryable),
      );
    } catch {
      // Fall through to the generic, non-sensitive message.
    }
  }
  return new RepositoryError('NETWORK_ERROR', 'Revisá tu conexión e intentá nuevamente.', true);
}

export async function extractTimeEntries(
  turns: CaptureTurn[],
  signal?: AbortSignal,
): Promise<ExtractResponse> {
  const { data, error } = await supabase.functions.invoke<ExtractResponse>('extract-time-entries', {
    body: { turns },
    signal,
  });
  if (error) throw await decodeFunctionError(error);
  if (!data) throw new RepositoryError('EMPTY_RESPONSE', 'La respuesta llegó vacía.', true);
  return data;
}

type TimeEntryRow = {
  id: string;
  user_id: string;
  work_stream_id: string;
  work_date: string;
  duration_minutes: number;
  start_time: string | null;
  end_time: string | null;
  project_name: string;
  task_description: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type WorkStreamRow = {
  id: string;
  user_id: string;
  project_name: string;
  task_description: string;
  last_used_at: string;
  status?: 'open' | 'completed';
  completed_at?: string | null;
  requester_type?: string | null;
  requester_name?: string | null;
  materials?: unknown;
};

type ProjectTotalRow = {
  project_name: string;
  duration_minutes: number;
};

function isMissingColumnError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return (
    code === '42703' ||
    /column .* does not exist|does not exist|column .* not found/i.test(message)
  );
}

function isMissingFunctionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    /function .* does not exist|routine .* does not exist|cannot find function/i.test(message)
  );
}

function isPermissionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return (
    code === '42501' ||
    /permission denied/i.test(message) ||
    /must be owner|requires privileges/i.test(message)
  );
}

function normalizeWorkStream(row: WorkStreamRow): WorkStream {
  const requesterType: TaskRequesterType | null =
    row.requester_type === 'sector' || row.requester_type === 'line' || row.requester_type === 'person'
      ? row.requester_type
      : null;
  const materials = Array.isArray(row.materials)
    ? row.materials.filter((material): material is string => typeof material === 'string' && material.trim().length > 0)
    : [];

  return {
    id: row.id,
    userId: row.user_id,
    projectName: row.project_name,
    taskDescription: row.task_description,
    lastUsedAt: row.last_used_at,
    status: row.status ?? 'open',
    completedAt: row.completed_at ?? null,
    requesterType,
    requesterName: row.requester_name?.trim() || null,
    materials,
  };
}

function projectTotalMinutesKey(projectName: string): string {
  return projectName.trim().toLowerCase();
}

async function attachProjectTotals(streams: WorkStream[]): Promise<WorkStream[]> {
  const requestedProjects = [...new Set(streams.map((stream) => stream.projectName.trim()).filter(Boolean))];
  if (requestedProjects.length === 0) return streams.map((stream) => ({ ...stream, projectTotalMinutes: 0 }));

  const { data, error } = await supabase
    .from('time_entries')
    .select('project_name,duration_minutes')
    .in('project_name', requestedProjects);

  if (error) throw error;

  const rawRows = (data ?? []) as ProjectTotalRow[];
  const totals = rawRows.reduce((acc, row) => {
    const key = projectTotalMinutesKey(row.project_name);
    const existing = acc.get(key) ?? 0;
    acc.set(key, existing + row.duration_minutes);
    return acc;
  }, new Map<string, number>());

  return streams.map((stream) => ({
    ...stream,
    projectTotalMinutes: totals.get(projectTotalMinutesKey(stream.projectName)) ?? 0,
  }));
}

async function listRecentWorkStreams(options: {
  activeSince: string;
  withStatusFilter: boolean;
  withTaskDetails: boolean;
}): Promise<WorkStream[]> {
  const fields = [
    'id',
    'user_id',
    'project_name',
    'task_description',
    'last_used_at',
    ...(options.withStatusFilter ? ['status', 'completed_at'] : []),
    ...(options.withTaskDetails ? ['requester_type', 'requester_name', 'materials'] : []),
  ].join(',');
  const query = supabase
    .from('work_streams')
    .select(fields)
    .gte('last_used_at', options.activeSince)
    .order('last_used_at', { ascending: false })
    .limit(20);
  const request = options.withStatusFilter ? query.eq('status', 'open') : query;
  const response = (await request) as {
    data: WorkStreamRow[] | null;
    error: { code?: string; message?: string } | null;
  };
  const { data, error } = response;
  if (error) throw error;
  return ((data ?? []) as WorkStreamRow[]).map(normalizeWorkStream);
}

function mapEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    workStreamId: row.work_stream_id,
    workDate: row.work_date,
    durationMinutes: row.duration_minutes,
    startTime: row.start_time?.slice(0, 5) ?? null,
    endTime: row.end_time?.slice(0, 5) ?? null,
    projectName: row.project_name,
    taskDescription: row.task_description,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function confirmTimeEntries(
  submissionId: string,
  drafts: EditableTimeEntryDraft[],
  attachments: LocalEvidenceAttachment[] = [],
): Promise<TimeEntry[]> {
  const payload = drafts.map((draft) => ({
    clientId: draft.clientId,
    workDate: draft.workDate,
    durationMinutes: draft.durationMinutes,
    startTime: draft.startTime,
    endTime: draft.endTime,
    projectName: draft.projectName.trim(),
    taskDescription: draft.taskDescription.trim(),
    notes: draft.notes?.trim() || null,
    requesterType: draft.requesterType ?? null,
    requesterName: draft.requesterName?.trim() || null,
    materials: draft.materials ?? [],
    selectedWorkStreamId: draft.selectedWorkStreamId,
  }));
  const { data, error } = await supabase.rpc('confirm_time_entries', {
    p_submission_id: submissionId,
    p_drafts: payload,
  });
  if (error) throw new RepositoryError('CONFIRM_FAILED', 'No pudimos guardar las horas.', true);
  const entries = ((data ?? []) as TimeEntryRow[]).map(mapEntry);
  if (attachments.length > 0) {
    await persistWorkEvidence(
      entries.map((entry) => entry.workStreamId),
      attachments,
    );
  }
  return entries;
}

export async function listTimeEntries(monday: string, sunday: string): Promise<TimeEntry[]> {
  const { data, error } = await supabase
    .from('time_entries')
    .select(
      'id,user_id,work_stream_id,work_date,duration_minutes,start_time,end_time,project_name,task_description,notes,created_at,updated_at',
    )
    .gte('work_date', monday)
    .lte('work_date', sunday)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new RepositoryError('HISTORY_FAILED', 'No pudimos cargar tus horas.', true);
  return ((data ?? []) as TimeEntryRow[]).map(mapEntry);
}

export async function getDayMinutes(workDate: string): Promise<number> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('duration_minutes')
    .eq('work_date', workDate);
  if (error) throw new RepositoryError('DAY_TOTAL_FAILED', 'No pudimos validar ese día.', true);
  return (data ?? []).reduce((total, row) => total + row.duration_minutes, 0);
}

export async function getTimeEntry(id: string): Promise<TimeEntry> {
  const { data, error } = await supabase
    .from('time_entries')
    .select(
      'id,user_id,work_stream_id,work_date,duration_minutes,start_time,end_time,project_name,task_description,notes,created_at,updated_at',
    )
    .eq('id', id)
    .single();
  if (error || !data) throw new RepositoryError('ENTRY_NOT_FOUND', 'No encontramos esa entrada.');
  return mapEntry(data as TimeEntryRow);
}

export async function listWorkStreams(): Promise<WorkStream[]> {
  const activeSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const streams = await listRecentWorkStreams({
      activeSince,
      withStatusFilter: true,
      withTaskDetails: true,
    });
    return await attachProjectTotals(streams);
  } catch (error) {
    if (isMissingColumnError(error)) {
      try {
        const streams = await listRecentWorkStreams({
          activeSince,
          withStatusFilter: false,
          withTaskDetails: true,
        });
        return await attachProjectTotals(streams);
      } catch (detailsError) {
        if (!isMissingColumnError(detailsError)) throw detailsError;
        const streams = await listRecentWorkStreams({
          activeSince,
          withStatusFilter: false,
          withTaskDetails: false,
        });
        return attachProjectTotals(streams);
      }
    }
    throw new RepositoryError('STREAMS_FAILED', 'No pudimos cargar tus tareas.', true);
  }
}

export async function completeWorkStream(workStreamId: string): Promise<void> {
  const rpcResult = await supabase.rpc('set_work_stream_status', {
    p_work_stream_id: workStreamId,
    p_status: 'completed',
  });

  if (!rpcResult.error) return;

  if (!isMissingFunctionError(rpcResult.error) && !isPermissionError(rpcResult.error)) {
    throw new RepositoryError('WORK_STREAM_UPDATE_FAILED', 'No pudimos cerrar esa tarea.', true);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    throw new RepositoryError('WORK_STREAM_UPDATE_FAILED', 'Tu sesión expiró. Iniciá sesión nuevamente.', true);
  }

  const completedAt = new Date().toISOString();
  const { data, error } = (await supabase
    .from('work_streams')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', workStreamId)
    .eq('user_id', userData.user.id)
    .select('id')) as {
    data: { id: string }[] | null;
    error: { code?: string; message?: string } | null;
  };

  if (error) {
    if (isMissingColumnError(error)) {
      throw new RepositoryError(
        'WORK_STREAM_UPDATE_NOT_SUPPORTED',
        'No pudimos cerrar esa tarea porque tu base aún no tiene el estado de tareas habilitado. Actualizá la migración.',
        true,
      );
    }
    throw new RepositoryError('WORK_STREAM_UPDATE_FAILED', 'No pudimos cerrar esa tarea.', true);
  }

  if (!data || data.length === 0) {
    throw new RepositoryError('WORK_STREAM_UPDATE_FAILED', 'No encontramos esa tarea para cerrar.', true);
  }
}

export async function updateTimeEntry(
  entry: TimeEntry,
  options: { workStreamId: string | null; createNewStream: boolean },
): Promise<TimeEntry> {
  const { data, error } = await supabase.rpc('update_time_entry', {
    p_entry_id: entry.id,
    p_work_stream_id: options.workStreamId,
    p_create_new_stream: options.createNewStream,
    p_work_date: entry.workDate,
    p_duration_minutes: entry.durationMinutes,
    p_start_time: entry.startTime,
    p_end_time: entry.endTime,
    p_project_name: entry.projectName.trim(),
    p_task_description: entry.taskDescription.trim(),
    p_notes: entry.notes?.trim() || null,
  });
  const row = (data as TimeEntryRow[] | null)?.[0];
  if (error || !row) throw new RepositoryError('UPDATE_FAILED', 'No pudimos actualizar la entrada.', true);
  return mapEntry(row);
}
