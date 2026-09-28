import {
  applyDurationEdit,
  decimalHoursToMinutes,
  durationFromRange,
  normalizeDraft,
} from '@/domain/time-normalization';

describe('time normalization [AC-4, AC-6]', () => {
  it.each([
    ['1,5', 90],
    ['1.5', 90],
    ['0,1', 6],
    [2.25, 135],
  ])('converts %p decimal hours to integer minutes', (value, expected) => {
    expect(decimalHoursToMinutes(value)).toBe(expected);
  });

  it('computes a same-day range deterministically', () => {
    expect(durationFromRange('09:00', '12:00')).toBe(180);
    expect(durationFromRange('09:15', '10:45')).toBe(90);
  });

  it.each([
    ['22:00', '02:00'],
    ['09:00', '09:00'],
    ['25:00', '26:00'],
  ])('rejects invalid or cross-midnight range %s-%s', (start, end) => {
    expect(() => durationFromRange(start, end)).toThrow();
  });

  it('uses the range as the source of truth and rejects conflicts', () => {
    expect(
      normalizeDraft(
        {
          clientId: 'draft-1',
          workDate: '2026-08-13',
          durationMinutes: 180,
          startTime: '09:00',
          endTime: '12:00',
          projectName: 'Horas',
          taskDescription: 'Corregir el login',
          notes: null,
          suggestedWorkStreamId: null,
        },
        { today: '2026-08-13', existingMinutesForDate: 0 },
      ).durationMinutes,
    ).toBe(180);

    expect(() =>
      normalizeDraft(
        {
          clientId: 'draft-2',
          workDate: '2026-08-13',
          durationMinutes: 120,
          startTime: '09:00',
          endTime: '12:00',
          projectName: 'Horas',
          taskDescription: 'Corregir el login',
          notes: null,
          suggestedWorkStreamId: null,
        },
        { today: '2026-08-13', existingMinutesForDate: 0 },
      ),
    ).toThrow('conflict');
  });

  it('rejects future dates and totals above 24 hours', () => {
    const base = {
      clientId: 'draft-3',
      workDate: '2026-08-14',
      durationMinutes: 60,
      startTime: null,
      endTime: null,
      projectName: 'Horas',
      taskDescription: 'Pruebas',
      notes: null,
      suggestedWorkStreamId: null,
    };

    expect(() =>
      normalizeDraft(base, { today: '2026-08-13', existingMinutesForDate: 0 }),
    ).toThrow('future');
    expect(() =>
      normalizeDraft(
        { ...base, workDate: '2026-08-13', durationMinutes: 61 },
        { today: '2026-08-13', existingMinutesForDate: 1_380 },
      ),
    ).toThrow('24 hours');
  });

  it('turns a range into a duration-only entry when its decimal hours are edited', () => {
    expect(
      applyDurationEdit(
        { durationMinutes: 180, startTime: '09:00', endTime: '12:00' },
        '2,5',
      ),
    ).toEqual({ durationMinutes: 150, startTime: null, endTime: null });
  });
});
