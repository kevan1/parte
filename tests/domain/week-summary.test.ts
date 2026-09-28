import { buildWeekSummary, mondayForDate } from '@/domain/week-summary';
import type { TimeEntry } from '@/domain/types';

const entry = (id: string, date: string, minutes: number): TimeEntry => ({
  id,
  userId: 'user-1',
  workStreamId: 'stream-1',
  workDate: date,
  durationMinutes: minutes,
  startTime: null,
  endTime: null,
  projectName: 'Horas',
  taskDescription: `Tarea ${id}`,
  notes: null,
  createdAt: '2026-08-13T12:00:00Z',
  updatedAt: '2026-08-13T12:00:00Z',
});

describe('week summary [AC-10]', () => {
  it('uses Monday as the start of the week', () => {
    expect(mondayForDate('2026-08-13')).toBe('2026-08-10');
    expect(mondayForDate('2026-08-10')).toBe('2026-08-10');
    expect(mondayForDate('2026-08-16')).toBe('2026-08-10');
  });

  it('groups entries newest-first and calculates today/week totals', () => {
    const summary = buildWeekSummary(
      [
        entry('a', '2026-08-13', 90),
        entry('b', '2026-08-13', 30),
        entry('c', '2026-08-11', 120),
        entry('old', '2026-08-09', 600),
      ],
      '2026-08-13',
    );

    expect(summary.todayMinutes).toBe(120);
    expect(summary.weekMinutes).toBe(240);
    expect(summary.days.map((day) => day.date)).toEqual(['2026-08-13', '2026-08-11']);
    expect(summary.days[0].entries).toHaveLength(2);
  });
});
