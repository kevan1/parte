import type { AvailabilitySnapshot, WorkSchedule } from '@/data/availability-repository';

export type AvailabilityStatus = {
  kind: 'available' | 'remote' | 'absent' | 'off-hours' | 'unconfigured';
  label: string;
  manual: boolean;
};

const weekdays: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

function localClock(schedule: WorkSchedule, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: schedule.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: weekdays[part('weekday')],
    time: `${part('hour')}:${part('minute')}`,
  };
}

export function calculateAvailability(snapshot: AvailabilitySnapshot, now: Date): AvailabilityStatus {
  const { schedule, override } = snapshot;
  if (override?.mode === 'available') {
    return { kind: 'available', label: 'Disponible', manual: true };
  }
  if (!schedule) {
    return { kind: 'unconfigured', label: 'Jornada sin configurar', manual: false };
  }

  const local = localClock(schedule, now);
  if (!schedule.weekdays.includes(local.weekday) || local.time < schedule.startTime || local.time >= schedule.endTime) {
    return { kind: 'off-hours', label: 'Fuera de horario', manual: false };
  }
  if (override?.date === local.date) {
    if (override.mode === 'remote') return { kind: 'remote', label: 'Remoto', manual: false };
    if (override.mode === 'absent') return { kind: 'absent', label: 'Ausente', manual: false };
  }
  return { kind: 'available', label: 'Disponible', manual: false };
}

export function formatTodaySchedule(schedule: WorkSchedule | null, now: Date): string {
  if (!schedule) return 'Jornada sin configurar';
  if (!schedule.weekdays.includes(localClock(schedule, now).weekday)) return 'Hoy · Sin jornada laboral';
  return `Hoy · ${schedule.startTime}–${schedule.endTime} (${schedule.timeZone})`;
}

export function nextAvailabilityCheck(now: Date): number {
  return 60_000 - (now.getTime() % 60_000);
}
