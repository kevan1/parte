import type { TimeEntryDraft } from '@/domain/types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class TimeValidationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_DURATION'
      | 'INVALID_RANGE'
      | 'RANGE_CONFLICT'
      | 'FUTURE_DATE'
      | 'DAILY_LIMIT'
      | 'MISSING_FIELD',
    message: string,
  ) {
    super(message);
    this.name = 'TimeValidationError';
  }
}

export function decimalHoursToMinutes(value: string | number): number {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const hours = typeof normalized === 'number' ? normalized : Number(normalized);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new TimeValidationError('INVALID_DURATION', 'duration must be positive');
  }
  const minutes = Math.round(hours * 60);
  if (minutes <= 0 || minutes > 1_440) {
    throw new TimeValidationError('INVALID_DURATION', 'duration must be within 24 hours');
  }
  return minutes;
}

export function applyDurationEdit(
  _current: { durationMinutes: number; startTime: string | null; endTime: string | null },
  decimalHours: string | number,
) {
  return {
    durationMinutes: decimalHoursToMinutes(decimalHours),
    startTime: null,
    endTime: null,
  };
}

function clockMinutes(value: string): number {
  if (!CLOCK_TIME.test(value)) {
    throw new TimeValidationError('INVALID_RANGE', 'time must use HH:mm');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function durationFromRange(startTime: string, endTime: string): number {
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  if (end <= start) {
    throw new TimeValidationError(
      'INVALID_RANGE',
      'range must end later on the same calendar day',
    );
  }
  return end - start;
}

type NormalizeOptions = {
  today: string;
  existingMinutesForDate: number;
};

export function normalizeDraft(
  input: TimeEntryDraft,
  options: NormalizeOptions,
): TimeEntryDraft {
  if (!ISO_DATE.test(input.workDate) || !ISO_DATE.test(options.today)) {
    throw new TimeValidationError('FUTURE_DATE', 'date must use YYYY-MM-DD');
  }
  if (input.workDate > options.today) {
    throw new TimeValidationError('FUTURE_DATE', 'future dates are not allowed');
  }

  const projectName = input.projectName.trim();
  const taskDescription = input.taskDescription.trim();
  if (!projectName || !taskDescription) {
    throw new TimeValidationError('MISSING_FIELD', 'project and task are required');
  }

  const hasStart = input.startTime !== null;
  const hasEnd = input.endTime !== null;
  if (hasStart !== hasEnd) {
    throw new TimeValidationError('INVALID_RANGE', 'start and end time must be provided together');
  }

  let durationMinutes = Math.round(input.durationMinutes);
  if (hasStart && hasEnd) {
    const rangeMinutes = durationFromRange(input.startTime!, input.endTime!);
    if (durationMinutes !== rangeMinutes) {
      throw new TimeValidationError('RANGE_CONFLICT', 'duration and range conflict');
    }
    durationMinutes = rangeMinutes;
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1_440) {
    throw new TimeValidationError('INVALID_DURATION', 'duration must be within 24 hours');
  }
  if (options.existingMinutesForDate + durationMinutes > 1_440) {
    throw new TimeValidationError('DAILY_LIMIT', 'daily total cannot exceed 24 hours');
  }

  return {
    ...input,
    projectName,
    taskDescription,
    notes: input.notes?.trim() || null,
    durationMinutes,
  };
}

export function formatDecimalHours(minutes: number): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: minutes % 60 === 0 ? 0 : 1,
  }).format(minutes / 60);
}
