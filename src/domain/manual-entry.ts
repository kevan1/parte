import type { EditableTimeEntryDraft, TaskRequesterType } from '@/domain/types';
import { formatDecimalHours } from '@/domain/time-normalization';

export const DURATION_HOURS = Array.from({ length: 24 }, (_, index) => index);
export const DURATION_MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
const MAX_REQUESTER_NAME_LENGTH = 160;
const MAX_MATERIALS_INPUT_LENGTH = 2_000;

export type ManualEntryFields = {
  workDate: string;
  hours: number;
  minutes: number;
  projectName: string;
  taskDescription: string;
  notes: string;
  selectedWorkStreamId: string | null;
  requesterType: TaskRequesterType | null;
  requesterName: string;
  materialsInput: string;
};

export type ManualEntryErrors = Partial<
  Record<
    | 'workDate'
    | 'duration'
    | 'projectName'
    | 'taskDescription'
    | 'notes'
    | 'requesterType'
    | 'requesterName'
    | 'materials',
    string
  >
>;

export function parseMaterialsInput(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function calendarDateIsValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function validateManualEntry(
  fields: ManualEntryFields,
  options: { today: string; existingDayMinutes: number },
): ManualEntryErrors {
  const errors: ManualEntryErrors = {};
  const durationMinutes = fields.hours * 60 + fields.minutes;

  if (!calendarDateIsValid(fields.workDate)) {
    errors.workDate = 'Elegí una fecha válida.';
  } else if (fields.workDate > options.today) {
    errors.workDate = 'La fecha no puede ser futura.';
  }

  if (
    !Number.isInteger(fields.hours) ||
    !DURATION_HOURS.includes(fields.hours) ||
    !Number.isInteger(fields.minutes) ||
    !DURATION_MINUTES.includes(fields.minutes) ||
    durationMinutes <= 0
  ) {
    errors.duration = 'La duración debe ser mayor a cero y usar intervalos de 5 minutos.';
  } else if (options.existingDayMinutes + durationMinutes > 1_440) {
    errors.duration = 'El total del día no puede superar las 24 horas.';
  }

  const projectName = fields.projectName.trim();
  if (!projectName) {
    errors.projectName = 'Ingresá un proyecto.';
  } else if (projectName.length > 120) {
    errors.projectName = 'El proyecto puede tener hasta 120 caracteres.';
  }

  const taskDescription = fields.taskDescription.trim();
  if (!taskDescription) {
    errors.taskDescription = 'Ingresá una tarea.';
  } else if (taskDescription.length > 500) {
    errors.taskDescription = 'La tarea puede tener hasta 500 caracteres.';
  }

  if (fields.notes.length > 2_000) {
    errors.notes = 'Las notas pueden tener hasta 2.000 caracteres.';
  }

  const requesterName = fields.requesterName.trim();
  if (requesterName && !fields.requesterType) {
    errors.requesterType = 'Elegí si lo pidió un sector, una línea o una persona.';
  }
  if (fields.requesterType && !requesterName) {
    errors.requesterName = 'Indicá quién pidió el trabajo.';
  } else if (requesterName.length > MAX_REQUESTER_NAME_LENGTH) {
    errors.requesterName = 'El solicitante puede tener hasta 160 caracteres.';
  }
  if (fields.materialsInput.length > MAX_MATERIALS_INPUT_LENGTH) {
    errors.materials = 'Los materiales pueden tener hasta 2.000 caracteres.';
  }

  return errors;
}

export function buildManualEntryDraft(
  fields: ManualEntryFields,
  clientId: string,
  existingDayMinutes: number,
): EditableTimeEntryDraft {
  const durationMinutes = fields.hours * 60 + fields.minutes;
  const selectedWorkStreamId = fields.selectedWorkStreamId;

  return {
    clientId,
    workDate: fields.workDate,
    durationMinutes,
    durationInput: formatDecimalHours(durationMinutes),
    startTime: null,
    endTime: null,
    projectName: fields.projectName.trim(),
    projectSuggestion: null,
    taskDescription: fields.taskDescription.trim(),
    notes: fields.notes.trim() || null,
    suggestedWorkStreamId: selectedWorkStreamId,
    suggestedWorkStream: null,
    selectedWorkStreamId,
    continuityChoice: selectedWorkStreamId ? 'existing' : 'new',
    existingDayMinutes,
    existingDayDate: fields.workDate,
    requesterType: fields.requesterType,
    requesterName: fields.requesterName.trim() || null,
    materials: parseMaterialsInput(fields.materialsInput),
  };
}
