import { supabase } from '@/data/supabase';
import { RepositoryError } from '@/data/repository-error';
import type { AssignableEmployee, AssignTaskParams, AssignTaskResult } from '@/domain/types';

// ── Name derivation (mirrors nameFromEmail in profile-repository.ts) ──────────
const nameFromEmail = (email: string): string => {
  const localPart = email.split('@')[0] ?? '';
  const words = localPart.split(/[._-]+/).filter(Boolean);
  const name = words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
  return name || 'Trabajador';
};

// ── List employees eligible to receive task assignments ───────────────────────

/** Returns all employees and admins eligible to receive task assignments, sorted by name. */
export const listAssignableEmployees = async (): Promise<AssignableEmployee[]> => {
  const { data, error } = await supabase.rpc('list_employee_schedules');

  if (error) {
    throw new RepositoryError(
      error.code ?? 'UNKNOWN',
      'No se pudieron cargar los empleados.',
      true,
    );
  }

  const rows = (data ?? []) as { id: string; email: string }[];
  const employees: AssignableEmployee[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: nameFromEmail(row.email),
  }));

  return employees.sort((a, b) => a.name.localeCompare(b.name, 'es'));
};

// ── Assign a task (admin only) ────────────────────────────────────────────────

/** Admin-only. Creates a work_stream for the assignee and triggers push notifications. */
export const assignTask = async (params: AssignTaskParams): Promise<AssignTaskResult> => {
  const { data, error } = await supabase.rpc('assign_task', {
    p_assignee_id: params.assigneeId,
    p_project_name: params.projectName,
    p_task_description: params.taskDescription,
    p_requester_type: params.requesterType ?? null,
    p_requester_name: params.requesterName ?? null,
    p_materials: params.materials ?? null,
  });

  if (error) {
    throw new RepositoryError(
      error.code ?? 'UNKNOWN',
      'No se pudo asignar la tarea. Revisá los datos y tus permisos, e intentá de nuevo.',
      true,
    );
  }

  return data as AssignTaskResult;
};
