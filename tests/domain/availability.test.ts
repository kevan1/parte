import type { AvailabilitySnapshot, WorkSchedule } from '@/data/availability-repository';
import { calculateAvailability, formatTodaySchedule, nextAvailabilityCheck } from '@/domain/availability';

const schedule: WorkSchedule = {
  userId: 'employee-1',
  weekdays: [1, 2, 3, 4, 5],
  startTime: '08:00',
  endTime: '17:00',
  timeZone: 'America/Argentina/Buenos_Aires',
};
const snapshot: AvailabilitySnapshot = { schedule, override: null, isAdmin: false };
const at = (date: string) => new Date(date);

describe('automatic availability [AC-AV-1]', () => {
  it.each([
    ['2026-09-09T10:59:59Z', 'off-hours'],
    ['2026-09-09T11:00:00Z', 'available'],
    ['2026-09-09T19:59:59Z', 'available'],
    ['2026-09-09T20:00:00Z', 'off-hours'],
    ['2026-09-12T15:00:00Z', 'off-hours'],
    ['2026-09-13T15:00:00Z', 'off-hours'],
    ['2026-09-14T11:00:00Z', 'available'],
  ])('resolves %s to %s', (date, kind) => {
    expect(calculateAvailability(snapshot, at(date))).toMatchObject({ kind, manual: false });
  });

  it('uses the schedule time zone rather than the device or UTC weekday', () => {
    const tokyo = { ...snapshot, schedule: { ...schedule, timeZone: 'Asia/Tokyo' } };
    expect(calculateAvailability(tokyo, at('2026-09-13T23:00:00Z')).kind).toBe('available');
  });

  it.each(['2026-03-06T13:00:00Z', '2026-03-09T12:00:00Z'])(
    'accounts for daylight saving at %s', (date) => {
      expect(calculateAvailability({ ...snapshot, schedule: { ...schedule, timeZone: 'America/New_York' } }, at(date)).kind).toBe('available');
    },
  );

  it('does not use a global default for employees without a schedule', () => {
    expect(calculateAvailability({ ...snapshot, schedule: null }, at('2026-09-09T15:00:00Z'))).toEqual({
      kind: 'unconfigured', label: 'Jornada sin configurar', manual: false,
    });
  });

  it('treats midnight as 00:00 rather than 24:00', () => {
    expect(calculateAvailability({ ...snapshot, schedule: { ...schedule, startTime: '00:00', endTime: '01:00' } }, at('2026-09-09T03:00:00Z')).kind).toBe('available');
  });
});

describe('availability exceptions [AC-AV-2]', () => {
  it.each(['2026-09-09T23:00:00Z', '2026-09-12T15:00:00Z', '2026-09-14T01:00:00Z'])(
    'keeps manual availability outside work and across dates at %s', (date) => {
      expect(calculateAvailability({ ...snapshot, override: { mode: 'available', date: null } }, at(date))).toEqual({
        kind: 'available', label: 'Disponible', manual: true,
      });
    },
  );

  it('allows manual availability without a schedule', () => {
    expect(calculateAvailability({ ...snapshot, schedule: null, override: { mode: 'available', date: null } }, at('2026-09-09T15:00:00Z')).manual).toBe(true);
  });

  it.each(['remote', 'absent'] as const)('applies %s only on its local date and within the schedule', (mode) => {
    const overridden = { ...snapshot, override: { mode, date: '2026-09-09' } };
    expect(calculateAvailability(overridden, at('2026-09-09T15:00:00Z')).kind).toBe(mode);
    expect(calculateAvailability(overridden, at('2026-09-09T20:00:00Z')).kind).toBe('off-hours');
    expect(calculateAvailability(overridden, at('2026-09-10T15:00:00Z')).kind).toBe('available');
    expect(calculateAvailability({ ...overridden, schedule: null }, at('2026-09-09T15:00:00Z')).kind).toBe('unconfigured');
  });

  it('matches exceptions against the local date instead of the UTC date', () => {
    const late = { ...snapshot, schedule: { ...schedule, startTime: '21:00', endTime: '23:59' }, override: { mode: 'remote' as const, date: '2026-09-09' } };
    expect(calculateAvailability(late, at('2026-09-10T01:00:00Z')).kind).toBe('remote');
  });

  it('returns to automatic after removing the exception', () => {
    expect(calculateAvailability({ ...snapshot, override: null }, at('2026-09-09T23:00:00Z')).kind).toBe('off-hours');
  });
});

describe('schedule presentation and refresh [AC-AV-3] [AC-AV-5]', () => {
  it('describes today without implying a weekend work interval', () => {
    expect(formatTodaySchedule(schedule, at('2026-09-09T15:00:00Z'))).toBe('Hoy · 08:00–17:00 (America/Argentina/Buenos_Aires)');
    expect(formatTodaySchedule(schedule, at('2026-09-12T15:00:00Z'))).toBe('Hoy · Sin jornada laboral');
    expect(formatTodaySchedule(null, at('2026-09-09T15:00:00Z'))).toBe('Jornada sin configurar');
  });

  it('schedules an exact next minute refresh without spinning on the boundary', () => {
    expect(nextAvailabilityCheck(at('2026-09-09T10:59:59.750Z'))).toBe(250);
    expect(nextAvailabilityCheck(at('2026-09-09T11:00:00.000Z'))).toBe(60000);
  });
});
