import type { TimeEntry } from '@/domain/types';

export type WeekDayGroup = {
  date: string;
  minutes: number;
  entries: TimeEntry[];
};

export type WeekSummary = {
  todayMinutes: number;
  weekMinutes: number;
  monday: string;
  sunday: string;
  days: WeekDayGroup[];
};

function parseIsoDate(date: string): Date {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid ISO date');
  return parsed;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function mondayForDate(date: string): string {
  const current = parseIsoDate(date);
  const day = current.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + offset);
  return isoDate(current);
}

export function addDays(date: string, days: number): string {
  const value = parseIsoDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

export function buildWeekSummary(entries: TimeEntry[], today: string): WeekSummary {
  const monday = mondayForDate(today);
  const sunday = addDays(monday, 6);
  const currentWeek = entries.filter(
    (entry) => entry.workDate >= monday && entry.workDate <= sunday,
  );
  const groups = new Map<string, TimeEntry[]>();
  for (const entry of currentWeek) {
    const group = groups.get(entry.workDate) ?? [];
    group.push(entry);
    groups.set(entry.workDate, group);
  }

  const days = [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, dayEntries]) => ({
      date,
      entries: dayEntries.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      minutes: dayEntries.reduce((total, entry) => total + entry.durationMinutes, 0),
    }));

  return {
    todayMinutes: currentWeek
      .filter((entry) => entry.workDate === today)
      .reduce((total, entry) => total + entry.durationMinutes, 0),
    weekMinutes: currentWeek.reduce((total, entry) => total + entry.durationMinutes, 0),
    monday,
    sunday,
    days,
  };
}

export function todayInTimeZone(
  now = new Date(),
  timeZone = 'America/Argentina/Buenos_Aires',
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
