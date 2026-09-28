import {
  buildManualEntryDraft,
  DURATION_HOURS,
  DURATION_MINUTES,
  validateManualEntry,
} from '@/domain/manual-entry';
import type { ManualEntryFields } from '@/domain/manual-entry';

const validFields = {
  workDate: '2026-08-14',
  hours: 1,
  minutes: 10,
  projectName: 'Horas',
  taskDescription: 'Implementar carga manual',
  notes: 'Prueba',
  selectedWorkStreamId: null,
  requesterType: 'person' as const,
  requesterName: 'Ana López',
  materialsInput: 'Tornillos, Cable 4 mm',
};

describe('manual time-entry rules [AC-ME-3, AC-ME-4, AC-ME-6]', () => {
  it('offers increasing hours and five-minute duration steps [AC-ME-3]', () => {
    expect(DURATION_HOURS).toEqual(Array.from({ length: 24 }, (_, index) => index));
    expect(DURATION_MINUTES).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('builds one duration-only draft with a selected recent stream [AC-ME-3, AC-ME-5]', () => {
    const draft = buildManualEntryDraft(
      { ...validFields, selectedWorkStreamId: '11111111-1111-4111-8111-111111111111' },
      '22222222-2222-4222-8222-222222222222',
      120,
    );

    expect(draft).toMatchObject({
      clientId: '22222222-2222-4222-8222-222222222222',
      durationMinutes: 70,
      durationInput: '1,17',
      startTime: null,
      endTime: null,
      selectedWorkStreamId: '11111111-1111-4111-8111-111111111111',
      continuityChoice: 'existing',
      existingDayMinutes: 120,
      existingDayDate: '2026-08-14',
      requesterType: 'person',
      requesterName: 'Ana López',
      materials: ['Tornillos', 'Cable 4 mm'],
    });
  });

  it.each([
    [{ ...validFields, hours: 0, minutes: 0 }, 'duration'],
    [{ ...validFields, workDate: '2026-02-30' }, 'workDate'],
    [{ ...validFields, workDate: '2026-08-15' }, 'workDate'],
    [{ ...validFields, projectName: ' ' }, 'projectName'],
    [{ ...validFields, projectName: 'p'.repeat(121) }, 'projectName'],
    [{ ...validFields, taskDescription: ' ' }, 'taskDescription'],
    [{ ...validFields, taskDescription: 't'.repeat(501) }, 'taskDescription'],
    [{ ...validFields, notes: 'n'.repeat(2_001) }, 'notes'],
    [{ ...validFields, requesterType: null, requesterName: 'Ana López' }, 'requesterType'],
    [{ ...validFields, requesterType: 'person', requesterName: '' }, 'requesterName'],
    [{ ...validFields, requesterName: 'n'.repeat(161) }, 'requesterName'],
  ])('rejects invalid manual fields [AC-ME-4]', (fields, expectedKey) => {
    expect(validateManualEntry(fields as ManualEntryFields, { today: '2026-08-14', existingDayMinutes: 0 })).toHaveProperty(
      expectedKey,
    );
  });

  it('rejects a valid entry when it would exceed the daily limit [AC-ME-4]', () => {
    expect(
      validateManualEntry(validFields, { today: '2026-08-14', existingDayMinutes: 1_380 }),
    ).toMatchObject({ duration: expect.stringContaining('24 horas') });
  });
});
