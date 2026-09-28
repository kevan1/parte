import { canConfirmDrafts, createCaptureStore } from '@/state/capture-store';
import type { ExtractResponse, LocalEvidenceAttachment, TimeEntryDraft } from '@/domain/types';
import { RepositoryError } from '@/data/time-entry-repository';

const draft = (overrides: Partial<TimeEntryDraft> = {}): TimeEntryDraft => ({
  clientId: '22222222-2222-4222-8222-222222222222',
  workDate: '2026-08-13',
  durationMinutes: 180,
  startTime: null,
  endTime: null,
  projectName: 'Horas',
  taskDescription: 'Corregir el login',
  notes: null,
  suggestedWorkStreamId: '11111111-1111-4111-8111-111111111111',
  existingDayMinutes: 0,
  existingDayDate: '2026-08-13',
  ...overrides,
});

function setup(response: ExtractResponse) {
  const extract = jest.fn().mockResolvedValue(response);
  const confirm = jest.fn().mockResolvedValue([]);
  const onConfirmed = jest.fn();
  const store = createCaptureStore({
    extract,
    confirm,
    createSubmissionId: () => '33333333-3333-4333-8333-333333333333',
    onConfirmed,
  });
  return { extract, confirm, onConfirmed, store };
}

describe('capture store [AC-5, AC-7, AC-8, AC-9, AC-12, AC-14]', () => {
  it('keeps clarification turns in memory and does not create drafts', async () => {
    const { store } = setup({
      status: 'needs_clarification',
      question: '¿En qué proyecto trabajaste?',
      missingFields: ['project'],
    });

    await store.getState().submit('Trabajé tres horas corrigiendo el login');

    expect(store.getState().phase).toBe('clarifying');
    expect(store.getState().turns).toHaveLength(2);
    expect(store.getState().drafts).toHaveLength(0);
  });

  it('does not auto-accept a suggested work stream', async () => {
    const { store } = setup({ status: 'ready', drafts: [draft()] });
    await store.getState().submit('Trabajé tres horas en Horas');

    expect(store.getState().phase).toBe('ready');
    expect(store.getState().drafts[0]).toMatchObject({
      suggestedWorkStreamId: '11111111-1111-4111-8111-111111111111',
      selectedWorkStreamId: null,
      continuityChoice: 'pending',
    });

    store.getState().acceptSuggestion(0);
    expect(store.getState().drafts[0].selectedWorkStreamId).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('clears a project alias suggestion when the employee edits the project', async () => {
    const { store } = setup({
      status: 'ready',
      drafts: [
        draft({
          suggestedWorkStreamId: null,
          projectSuggestion: { inputName: 'Horas', existingName: 'Horas app' },
          projectName: 'Horas app',
        }),
      ],
    });
    await store.getState().submit('Una hora en Horas');

    store.getState().updateDraft(0, { projectName: 'Otro proyecto' });

    expect(store.getState().drafts[0].projectSuggestion).toBeNull();
  });

  it('confirms several drafts together using one stable submission id', async () => {
    const { store, confirm, onConfirmed } = setup({
      status: 'ready',
      drafts: [draft(), draft({ clientId: '44444444-4444-4444-8444-444444444444' })],
    });
    await store.getState().submit('Dos tareas distintas');
    store.getState().useNewStream(0);
    store.getState().useNewStream(1);
    store.getState().updateDraft(1, { durationMinutes: 60, durationInput: '1' });
    await store.getState().confirm();

    expect(confirm).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      expect.arrayContaining([expect.objectContaining({ durationMinutes: 60 })]),
    );
    expect(store.getState().phase).toBe('saved');
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('keeps selected evidence with the capture until confirmation', async () => {
    const { store, confirm } = setup({
      status: 'ready',
      drafts: [draft({ suggestedWorkStreamId: null })],
    });
    const attachments: LocalEvidenceAttachment[] = [
      {
        id: 'ph://asset-1',
        fileName: 'tablero.jpg',
        width: 1200,
        height: 900,
        creationTime: 1_755_000_000_000,
      },
    ];

    await store.getState().submit('Trabajé en el tablero', attachments);
    expect(store.getState().attachments).toEqual(attachments);
    expect(store.getState().turns[0]).toMatchObject({
      role: 'user',
      content: 'Trabajé en el tablero',
      attachments,
    });
    store.getState().useNewStream(0);
    await store.getState().confirm();

    expect(confirm).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      expect.any(Array),
      attachments,
    );
  });

  it('does not repeat the first turn evidence on clarification answers', async () => {
    const { store } = setup({
      status: 'needs_clarification',
      question: '¿En qué proyecto trabajaste?',
      missingFields: ['project'],
    });
    const attachments: LocalEvidenceAttachment[] = [
      { id: 'ph://asset-1', fileName: 'tablero.jpg', width: 1, height: 1, creationTime: null },
    ];

    await store.getState().submit('Trabajé en el tablero', attachments);
    await store.getState().submit('Horas app');

    expect(store.getState().turns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: 'Trabajé en el tablero', attachments }),
        expect.objectContaining({ content: 'Horas app' }),
      ]),
    );
    expect(store.getState().turns.find((turn) => turn.content === 'Horas app')?.attachments).toBeUndefined();
  });

  it('keeps evidence available when its upload can be retried', async () => {
    const { store, confirm } = setup({
      status: 'ready',
      drafts: [draft({ suggestedWorkStreamId: null })],
    });
    const attachments: LocalEvidenceAttachment[] = [
      { id: 'ph://asset-1', fileName: 'tablero.jpg', width: 1, height: 1, creationTime: null },
    ];
    confirm.mockRejectedValueOnce(
      new RepositoryError('EVIDENCE_UPLOAD_FAILED', 'Las horas se guardaron, pero no pudimos subir las fotos. Reintentá.', true),
    );

    await store.getState().submit('Trabajé en el tablero', attachments);
    store.getState().useNewStream(0);
    await store.getState().confirm();

    expect(store.getState()).toMatchObject({
      phase: 'ready',
      attachments,
      errorMessage: expect.stringContaining('no pudimos subir las fotos'),
    });

    await store.getState().confirm();
    expect(store.getState().phase).toBe('saved');
  });

  it('preserves failed input and exposes retry state', async () => {
    const extract = jest.fn().mockRejectedValue(new Error('network'));
    const store = createCaptureStore({
      extract,
      confirm: jest.fn(),
      createSubmissionId: crypto.randomUUID,
    });

    await store.getState().submit('Texto que no quiero perder');

    expect(store.getState().phase).toBe('error');
    expect(store.getState().failedInput).toBe('Texto que no quiero perder');
    expect(store.getState().errorMessage).toContain('conexión');
    expect(store.getState().turns).toEqual([]);
  });

  it('preserves a typed quota message instead of reporting a network failure', async () => {
    const store = createCaptureStore({
      extract: jest
        .fn()
        .mockRejectedValue(
          new RepositoryError('QUOTA_EXCEEDED', 'Alcanzaste el límite de interpretaciones por hoy.'),
        ),
      confirm: jest.fn(),
      createSubmissionId: crypto.randomUUID,
    });

    await store.getState().submit('Tres horas en Horas');

    expect(store.getState().errorMessage).toBe('Alcanzaste el límite de interpretaciones por hoy.');
  });

  it('retries a failed message once without duplicating it in model turns', async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'ready', drafts: [draft({ suggestedWorkStreamId: null })] });
    const store = createCaptureStore({
      extract,
      confirm: jest.fn(),
      createSubmissionId: crypto.randomUUID,
    });

    await store.getState().submit('Tres horas en Horas');
    await store.getState().submit('Tres horas en Horas');

    expect(extract).toHaveBeenLastCalledWith(
      [{ role: 'user', content: 'Tres horas en Horas' }],
      expect.any(Object),
    );
  });

  it('keeps short clarification answers self-contained for the model', async () => {
    const extract = jest
      .fn()
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        question: '¿Cuántas horas le dedicaste?',
        missingFields: ['duration'],
      })
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        question: '¿En qué proyecto trabajaste?',
        missingFields: ['project'],
      })
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        question: '¿Qué tarea realizaste?',
        missingFields: ['task'],
      })
      .mockResolvedValueOnce({ status: 'ready', drafts: [draft({ suggestedWorkStreamId: null })] });
    const store = createCaptureStore({
      extract,
      confirm: jest.fn(),
      createSubmissionId: () => '33333333-3333-4333-8333-333333333333',
    });

    await store.getState().submit('Hoy trabajé');
    await store.getState().submit('8');
    await store.getState().submit('Horas app');
    await store.getState().submit('Corrigiendo el login');

    expect(extract).toHaveBeenLastCalledWith(
      [
        { role: 'user', content: 'Hoy trabajé' },
        {
          role: 'user',
          content: 'Respuesta a “¿Cuántas horas le dedicaste?”: 8',
        },
        {
          role: 'user',
          content: 'Respuesta a “¿En qué proyecto trabajaste?”: Horas app',
        },
        {
          role: 'user',
          content: 'Respuesta a “¿Qué tarea realizaste?”: Corrigiendo el login',
        },
      ],
      expect.any(Object),
    );
    expect(store.getState().turns.map((turn) => turn.content)).toContain('8');
    expect(store.getState().turns.map((turn) => turn.content)).not.toContain(
      'Respuesta a “¿Cuántas horas le dedicaste?”: 8',
    );
    expect(store.getState()).toMatchObject({ phase: 'ready', errorMessage: null });
  });

  it('clears transient model context when capture state resets', async () => {
    const extract = jest
      .fn()
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        question: '¿En qué proyecto trabajaste?',
        missingFields: ['project'],
      })
      .mockResolvedValueOnce({ status: 'ready', drafts: [draft({ suggestedWorkStreamId: null })] });
    const store = createCaptureStore({
      extract,
      confirm: jest.fn(),
      createSubmissionId: () => '33333333-3333-4333-8333-333333333333',
    });

    await store.getState().submit('Datos del usuario A');
    store.getState().reset();
    await store.getState().submit('Datos del usuario B');

    expect(extract).toHaveBeenLastCalledWith(
      [{ role: 'user', content: 'Datos del usuario B' }],
      expect.any(Object),
    );
  });

  it('blocks impossible/future dates and batches above 24 hours', () => {
    const editable = (overrides: Record<string, unknown> = {}) => ({
      ...draft({ suggestedWorkStreamId: null }),
      durationInput: '13',
      selectedWorkStreamId: null,
      continuityChoice: 'new' as const,
      ...overrides,
    });

    expect(canConfirmDrafts([editable({ workDate: '2026-02-31' })], '2026-08-13')).toBe(false);
    expect(canConfirmDrafts([editable({ workDate: '2026-08-14' })], '2026-08-13')).toBe(false);
    expect(
      canConfirmDrafts(
        [editable(), editable({ clientId: '44444444-4444-4444-8444-444444444444' })],
        '2026-08-13',
      ),
    ).toBe(false);
    expect(
      canConfirmDrafts(
        [
          editable({
            durationMinutes: 300,
            durationInput: '5',
            existingDayMinutes: 1_200,
          }),
        ],
        '2026-08-13',
      ),
    ).toBe(false);
  });

  it('discards an extraction that completes after session state is reset', async () => {
    let resolveExtraction!: (value: ExtractResponse) => void;
    const extract = jest.fn().mockReturnValue(
      new Promise<ExtractResponse>((resolve) => {
        resolveExtraction = resolve;
      }),
    );
    const store = createCaptureStore({
      extract,
      confirm: jest.fn(),
      createSubmissionId: crypto.randomUUID,
    });

    const pending = store.getState().submit('Datos privados del usuario A');
    store.getState().reset();
    resolveExtraction({ status: 'ready', drafts: [draft({ suggestedWorkStreamId: null })] });
    await pending;

    expect(store.getState()).toMatchObject({ phase: 'idle', turns: [], drafts: [] });
  });

  it('aborts the active extraction request when capture resets', async () => {
    let receivedSignal: AbortSignal | undefined;
    const extract = jest.fn((_turns, signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<ExtractResponse>(() => undefined);
    });
    const store = createCaptureStore({
      extract,
      confirm: jest.fn(),
      createSubmissionId: crypto.randomUUID,
    });

    void store.getState().submit('Datos que ya no quiero interpretar');
    store.getState().reset();

    expect(receivedSignal?.aborted).toBe(true);
    expect(store.getState()).toMatchObject({ phase: 'idle', turns: [], drafts: [] });
  });
});
