import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCaptureStore } from '@/state/capture-store';

describe('employee time-entry workflow [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13]', () => {
  it('keeps capture ephemeral and sends only confirmed structured drafts to persistence', async () => {
    const confirm = jest.fn().mockResolvedValue([]);
    const store = createCaptureStore({
      extract: jest.fn().mockResolvedValue({
        status: 'ready',
        drafts: [
          {
            clientId: '22222222-2222-4222-8222-222222222222',
            workDate: '2026-08-13',
            durationMinutes: 90,
            startTime: null,
            endTime: null,
            projectName: 'Horas',
            taskDescription: 'Corregir login',
            notes: null,
            suggestedWorkStreamId: null,
            existingDayMinutes: 0,
            existingDayDate: '2026-08-13',
          },
        ],
      }),
      confirm,
      createSubmissionId: () => '33333333-3333-4333-8333-333333333333',
    });

    await store.getState().submit('Texto original que no debe persistirse');
    await store.getState().confirm();

    expect(confirm).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      [expect.not.objectContaining({ content: expect.anything(), turns: expect.anything() })],
    );
  });

  it('has no chat/audio/source-text columns in the persisted schema', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260813182704_create_horas_schema.sql'),
      'utf8',
    ).toLowerCase();
    expect(migration).not.toMatch(/\b(chat|audio|transcript|source_text|original_text)\b/);
  });
});
