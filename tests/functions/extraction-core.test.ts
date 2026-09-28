import {
  ExtractionError,
  handleExtraction,
  type ExtractionDependencies,
} from '../../supabase/functions/_shared/extraction-core';

const baseRequest = new Request('https://example.supabase.co/functions/v1/extract-time-entries', {
  method: 'POST',
  headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    turns: [{ role: 'user', content: 'Hoy trabajé 3 horas en Horas corrigiendo el login' }],
  }),
});

function dependencies(
  overrides: Partial<ExtractionDependencies> = {},
): ExtractionDependencies {
  return {
    authenticate: jest.fn().mockResolvedValue({ id: 'user-1' }),
    consumeQuota: jest.fn().mockResolvedValue({ allowed: true }),
    recentStreams: jest.fn().mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        projectName: 'Horas',
        taskDescription: 'Corregir el login',
      },
    ]),
    dailyMinutes: jest.fn().mockResolvedValue({}),
    generate: jest.fn().mockResolvedValue({
      status: 'ready',
      question: null,
      missingFields: [],
      drafts: [
        {
          workDate: '2026-08-13',
          durationMinutes: 180,
          startTime: null,
          endTime: null,
          projectName: 'Horas',
          taskDescription: 'Corregir el login',
          notes: null,
          suggestedWorkStreamId: '11111111-1111-4111-8111-111111111111',
        },
      ],
    }),
    createClientId: jest.fn().mockReturnValue('22222222-2222-4222-8222-222222222222'),
    today: '2026-08-13',
    ...overrides,
  };
}

describe('extraction boundary [AC-5, AC-7, AC-8, AC-9, AC-14]', () => {
  it('rejects unauthenticated requests before consuming quota', async () => {
    const deps = dependencies({
      authenticate: jest.fn().mockRejectedValue(new ExtractionError(401, 'UNAUTHORIZED')),
    });
    const response = await handleExtraction(baseRequest.clone(), deps);
    expect(response.status).toBe(401);
    expect(deps.consumeQuota).not.toHaveBeenCalled();
  });

  it.each([
    [{ turns: [] }, 422],
    [{ turns: Array.from({ length: 9 }, () => ({ role: 'user', content: 'x' })) }, 422],
    [{ turns: [{ role: 'assistant', content: 'termina mal' }] }, 422],
    [{ turns: [{ role: 'user', content: 'x'.repeat(2_001) }] }, 422],
  ])('rejects malformed capture payloads', async (body, status) => {
    const response = await handleExtraction(
      new Request(baseRequest.url, {
        method: 'POST',
        headers: baseRequest.headers,
        body: JSON.stringify(body),
      }),
      dependencies(),
    );
    expect(response.status).toBe(status);
  });

  it('returns 429 and never calls Gemini when quota is exhausted', async () => {
    const deps = dependencies({
      consumeQuota: jest.fn().mockResolvedValue({ allowed: false }),
    });
    const response = await handleExtraction(baseRequest.clone(), deps);
    expect(response.status).toBe(429);
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('rejects an oversized chunked body without relying on content-length', async () => {
    const response = await handleExtraction(
      new Request(baseRequest.url, {
        method: 'POST',
        headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: [{ role: 'user', content: 'x'.repeat(25_000) }] }),
      }),
      dependencies(),
    );

    expect(response.status).toBe(422);
  });

  it('returns a concise clarification when required fields are missing', async () => {
    const deps = dependencies({
      generate: jest.fn().mockResolvedValue({
        status: 'needs_clarification',
        question: '¿En qué proyecto trabajaste?',
        missingFields: ['project'],
        drafts: [],
      }),
    });
    const response = await handleExtraction(baseRequest.clone(), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'needs_clarification',
      question: '¿En qué proyecto trabajaste?',
      missingFields: ['project'],
    });
  });

  it('interprets non-working clarification answers as task when both fields were missing', async () => {
    const deps = dependencies({
      generate: jest.fn().mockResolvedValue({
        status: 'needs_clarification',
        question: '¿Para qué proyecto y qué tarea querés cargar?',
        missingFields: ['project', 'task'],
        drafts: [],
      }),
    });

    const response = await handleExtraction(
      new Request(baseRequest.url, {
        method: 'POST',
        headers: baseRequest.headers,
        body: JSON.stringify({
          turns: [
            { role: 'user', content: 'ayer trabaje 8 horas en total' },
            { role: 'assistant', content: '¿Para qué proyecto y qué tarea querés cargar?' },
            {
              role: 'user',
              content: 'Respuesta a “¿Para qué proyecto y qué tarea querés cargar?”: Día feriado',
            },
          ],
        }),
      }),
      deps,
    );

    expect(await response.json()).toEqual({
      status: 'needs_clarification',
      question: '¿En qué proyecto querías cargar esas horas?',
      missingFields: ['project'],
    });
  });

  it('clarifies duration before confirmation when the day would exceed 24 hours', async () => {
    const response = await handleExtraction(
      baseRequest.clone(),
      dependencies({ dailyMinutes: jest.fn().mockResolvedValue({ '2026-08-13': 1_380 }) }),
    );

    expect(await response.json()).toEqual({
      status: 'needs_clarification',
      question: expect.stringContaining('24 horas'),
      missingFields: ['duration'],
    });
  });

  it('assigns server IDs and preserves only owned stream suggestions', async () => {
    const deps = dependencies();
    const response = await handleExtraction(baseRequest.clone(), deps);
    const result = await response.json();
    expect(result.drafts[0].clientId).toBe('22222222-2222-4222-8222-222222222222');
    expect(result.drafts[0].suggestedWorkStreamId).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result.drafts[0].suggestedWorkStream).toEqual({
      projectName: 'Horas',
      taskDescription: 'Corregir el login',
    });
    expect(result.drafts[0].existingDayMinutes).toBe(0);
    expect(result.drafts[0].existingDayDate).toBe('2026-08-13');
  });

  it('reuses the canonical recent project name without merging different tasks', async () => {
    const deps = dependencies({
      generate: jest.fn().mockResolvedValue({
        status: 'ready',
        question: null,
        missingFields: [],
        drafts: [
          {
            workDate: '2026-08-13',
            durationMinutes: 60,
            startTime: null,
            endTime: null,
            projectName: 'Horas app',
            taskDescription: 'Desarrollo de la app',
            notes: null,
            suggestedWorkStreamId: null,
          },
        ],
      }),
    });

    const result = await (await handleExtraction(baseRequest.clone(), deps)).json();

    expect(result.drafts[0].projectName).toBe('Horas');
    expect(result.drafts[0].projectSuggestion).toEqual({
      inputName: 'Horas app',
      existingName: 'Horas',
    });
    expect(result.drafts[0].taskDescription).toBe('Desarrollo de la app');
    expect(result.drafts[0].suggestedWorkStreamId).toBeNull();
  });

  it('keeps the first project alias when multiple matching names already exist', async () => {
    const deps = dependencies({
      recentStreams: jest.fn().mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          projectName: 'Horas',
          taskDescription: 'Corregir el login',
          createdAt: '2026-08-13T22:47:00.000Z',
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          projectName: 'Horas app',
          taskDescription: 'Desarrollo de la app',
          createdAt: '2026-08-13T22:46:00.000Z',
        },
      ]),
    });

    const result = await (await handleExtraction(baseRequest.clone(), deps)).json();

    expect(result.drafts[0].projectName).toBe('Horas app');
    expect(result.drafts[0].projectSuggestion).toEqual({
      inputName: 'Horas',
      existingName: 'Horas app',
    });
    expect(result.drafts[0].suggestedWorkStreamId).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('does not remove meaningful generic words from the middle of a project name', async () => {
    const deps = dependencies({
      recentStreams: jest.fn().mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          projectName: 'Store',
          taskDescription: 'Catálogo',
          createdAt: '2026-08-13T20:00:00.000Z',
        },
      ]),
      generate: jest.fn().mockResolvedValue({
        status: 'ready',
        question: null,
        missingFields: [],
        drafts: [
          {
            workDate: '2026-08-13',
            durationMinutes: 60,
            startTime: null,
            endTime: null,
            projectName: 'App Store',
            taskDescription: 'Publicación',
            notes: null,
            suggestedWorkStreamId: null,
          },
        ],
      }),
    });

    const result = await (await handleExtraction(baseRequest.clone(), deps)).json();

    expect(result.drafts[0].projectName).toBe('App Store');
    expect(result.drafts[0].projectSuggestion).toBeNull();
  });

  it.each([
    ['C++', 'C#'],
    ['東京', 'Москва'],
  ])('does not merge distinct punctuation or Unicode project names (%s / %s)', async (input, existing) => {
    const deps = dependencies({
      recentStreams: jest.fn().mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          projectName: existing,
          taskDescription: 'Existing task',
          createdAt: '2026-08-13T20:00:00.000Z',
        },
      ]),
      generate: jest.fn().mockResolvedValue({
        status: 'ready',
        question: null,
        missingFields: [],
        drafts: [
          {
            workDate: '2026-08-13',
            durationMinutes: 60,
            startTime: null,
            endTime: null,
            projectName: input,
            taskDescription: 'New task',
            notes: null,
            suggestedWorkStreamId: null,
          },
        ],
      }),
    });

    const result = await (await handleExtraction(baseRequest.clone(), deps)).json();

    expect(result.drafts[0].projectName).toBe(input);
    expect(result.drafts[0].projectSuggestion).toBeNull();
  });

  it('uses the stream id as a stable tie-breaker for equal creation timestamps', async () => {
    const deps = dependencies({
      recentStreams: jest.fn().mockResolvedValue([
        {
          id: '33333333-3333-4333-8333-333333333333',
          projectName: 'Horas',
          taskDescription: 'Second task',
          createdAt: '2026-08-13T20:00:00.000Z',
        },
        {
          id: '11111111-1111-4111-8111-111111111111',
          projectName: 'Horas app',
          taskDescription: 'First task',
          createdAt: '2026-08-13T20:00:00.000Z',
        },
      ]),
    });

    const result = await (await handleExtraction(baseRequest.clone(), deps)).json();

    expect(result.drafts[0].projectName).toBe('Horas app');
  });

  it('nulls a suggested ID that is not in the user allowlist', async () => {
    const deps = dependencies({
      generate: jest.fn().mockResolvedValue({
        status: 'ready',
        question: null,
        missingFields: [],
        drafts: [
          {
            workDate: '2026-08-13',
            durationMinutes: 180,
            startTime: null,
            endTime: null,
            projectName: 'Horas',
            taskDescription: 'Login',
            notes: null,
            suggestedWorkStreamId: '99999999-9999-4999-8999-999999999999',
          },
        ],
      }),
    });
    const result = await (await handleExtraction(baseRequest.clone(), deps)).json();
    expect(result.drafts[0].suggestedWorkStreamId).toBeNull();
  });

  it.each([
    [
      {
        status: 'ready',
        question: null,
        missingFields: [],
        drafts: [{ projectName: 'Horas' }],
      },
      'invalid shape',
    ],
    [
      {
        status: 'ready',
        question: null,
        missingFields: [],
        drafts: [
          {
            workDate: '2026-08-14',
            durationMinutes: 60,
            startTime: null,
            endTime: null,
            projectName: 'Horas',
            taskDescription: 'Futuro',
            notes: null,
            suggestedWorkStreamId: null,
          },
        ],
      },
      'future date',
    ],
    [
      {
        status: 'ready',
        question: null,
        missingFields: [],
        drafts: [
          {
            workDate: '2026-02-31',
            durationMinutes: 60,
            startTime: null,
            endTime: null,
            projectName: 'Horas',
            taskDescription: 'Fecha imposible',
            notes: null,
            suggestedWorkStreamId: null,
          },
        ],
      },
      'invalid calendar date',
    ],
  ])('maps invalid Gemini output to a safe 503 (%s)', async (output, _label) => {
    const response = await handleExtraction(
      baseRequest.clone(),
      dependencies({ generate: jest.fn().mockResolvedValue(output) }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'EXTRACTION_UNAVAILABLE',
      message: 'No pudimos interpretar el registro. Intentá nuevamente.',
      retryable: true,
    });
  });
});
