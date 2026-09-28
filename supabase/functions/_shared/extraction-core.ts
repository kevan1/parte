import { z } from 'zod';

const turnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2_000),
});

const requestSchema = z.object({
  turns: z.array(turnSchema).min(1).max(8),
});

const missingFieldSchema = z.enum(['project', 'task', 'duration']);
const modelDraftSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(1).max(1_440),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
  projectName: z.string().trim().min(1).max(120),
  taskDescription: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2_000).nullable(),
  suggestedWorkStreamId: z.string().uuid().nullable(),
});

const modelResponseSchema = z.object({
  status: z.enum(['needs_clarification', 'ready']),
  question: z.string().trim().max(240).nullable(),
  missingFields: z.array(missingFieldSchema).max(3),
  drafts: z.array(modelDraftSchema).max(10),
});

export type RecentStream = {
  id: string;
  projectName: string;
  taskDescription: string;
  createdAt?: string;
};

export type ExtractionDependencies = {
  authenticate: (authorization: string | null) => Promise<{ id: string }>;
  consumeQuota: () => Promise<{ allowed: boolean }>;
  recentStreams: (userId: string) => Promise<RecentStream[]>;
  dailyMinutes: (userId: string, dates: string[]) => Promise<Record<string, number>>;
  generate: (input: {
    turns: z.infer<typeof turnSchema>[];
    recentStreams: RecentStream[];
    today: string;
  }) => Promise<unknown>;
  createClientId: () => string;
  today: string;
  reportFailure?: (failure: { stage: string; kind: string }) => void;
};

export class ExtractionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
    this.name = 'ExtractionError';
  }
}

export class ExtractionDependencyError extends Error {
  constructor(readonly kind: string) {
    super(kind);
    this.name = 'ExtractionDependencyError';
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function safeError(error: unknown): Response {
  if (error instanceof ExtractionError) {
    const messages: Record<string, string> = {
      UNAUTHORIZED: 'Necesitás iniciar sesión nuevamente.',
      INVALID_REQUEST: 'Revisá el mensaje e intentá nuevamente.',
      QUOTA_EXCEEDED: 'Alcanzaste el límite de interpretaciones por hoy.',
      EXTRACTION_UNAVAILABLE: 'No pudimos interpretar el registro. Intentá nuevamente.',
      METHOD_NOT_ALLOWED: 'Método no permitido.',
    };
    return json(
      {
        code: error.code,
        message: messages[error.code] ?? 'No pudimos procesar la solicitud.',
        retryable: error.retryable,
      },
      error.status,
    );
  }
  return json(
    {
      code: 'EXTRACTION_UNAVAILABLE',
      message: 'No pudimos interpretar el registro. Intentá nuevamente.',
      retryable: true,
    },
    503,
  );
}

async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes) {
      throw new ExtractionError(422, 'INVALID_REQUEST');
    }
  }

  if (!request.body) throw new ExtractionError(422, 'INVALID_REQUEST');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ExtractionError(422, 'INVALID_REQUEST');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ExtractionError(422, 'INVALID_REQUEST');
  }
}

function timeMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const genericProjectDescriptors = new Set([
  'app',
  'application',
  'aplicacion',
  'aplicativo',
  'project',
  'proyecto',
]);
const leadingProjectDescriptors = new Set(['project', 'proyecto']);

function projectTokens(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('es-AR')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function descriptorKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function projectIdentity(value: string): string {
  const tokens = projectTokens(value);
  const meaningfulTokens = [...tokens];
  while (
    meaningfulTokens.length > 1 &&
    leadingProjectDescriptors.has(descriptorKey(meaningfulTokens[0]))
  ) {
    meaningfulTokens.shift();
  }
  while (
    meaningfulTokens.length > 1 &&
    genericProjectDescriptors.has(descriptorKey(meaningfulTokens.at(-1) ?? ''))
  ) {
    meaningfulTokens.pop();
  }
  return meaningfulTokens.join(' ');
}

function resolveProjectName(projectName: string, recentStreams: RecentStream[]) {
  const identity = projectIdentity(projectName);
  const matchingStreams = recentStreams.filter(
    (stream) => projectIdentity(stream.projectName) === identity,
  );
  const canonicalStream = [...matchingStreams].sort((left, right) => {
    if (left.createdAt && right.createdAt) {
      const createdAtDifference = left.createdAt.localeCompare(right.createdAt);
      if (createdAtDifference !== 0) return createdAtDifference;
    }
    if (left.createdAt && !right.createdAt) return -1;
    if (!left.createdAt && right.createdAt) return 1;
    return left.id.localeCompare(right.id);
  })[0];
  const existingName = canonicalStream?.projectName;

  if (!existingName || existingName === projectName) {
    return { projectName, projectSuggestion: null };
  }
  return {
    projectName: existingName,
    projectSuggestion: { inputName: projectName, existingName },
  };
}

function validateModelResponse(value: unknown, today: string) {
  const response = modelResponseSchema.parse(value);
  if (response.status === 'needs_clarification') {
    if (!response.question || response.missingFields.length === 0 || response.drafts.length > 0) {
      throw new Error('invalid clarification response');
    }
    return response;
  }
  if (response.question !== null || response.missingFields.length > 0 || response.drafts.length < 1) {
    throw new Error('invalid ready response');
  }
  for (const draft of response.drafts) {
    if (!isCalendarDate(draft.workDate)) throw new Error('invalid calendar date');
    if (draft.workDate > today) throw new Error('future date');
    if ((draft.startTime === null) !== (draft.endTime === null)) {
      throw new Error('incomplete range');
    }
    if (draft.startTime && draft.endTime) {
      const rangeMinutes = timeMinutes(draft.endTime) - timeMinutes(draft.startTime);
      if (rangeMinutes <= 0 || rangeMinutes !== draft.durationMinutes) {
        throw new Error('invalid range');
      }
    }
  }
  return response;
}

export async function handleExtraction(
  request: Request,
  dependencies: ExtractionDependencies,
): Promise<Response> {
  let stage = 'method';
  try {
    if (request.method !== 'POST') {
      throw new ExtractionError(405, 'METHOD_NOT_ALLOWED');
    }
    stage = 'authenticate';
    const user = await dependencies.authenticate(request.headers.get('authorization'));
    stage = 'request';
    const rawBody = await readLimitedJson(request, 20_000);
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success || parsed.data.turns.at(-1)?.role !== 'user') {
      throw new ExtractionError(422, 'INVALID_REQUEST');
    }

    stage = 'quota';
    const quota = await dependencies.consumeQuota();
    if (!quota.allowed) throw new ExtractionError(429, 'QUOTA_EXCEEDED');

    stage = 'recent_streams';
    const recentStreams = (await dependencies.recentStreams(user.id)).slice(0, 20);
    stage = 'gemini';
    const modelOutput = await dependencies.generate({
      turns: parsed.data.turns,
      recentStreams,
      today: dependencies.today,
    });
    stage = 'model_validation';
    const result = validateModelResponse(modelOutput, dependencies.today);

    if (result.status === 'needs_clarification') {
      const adjusted = normalizeClarificationResult(result, parsed.data.turns);
      return json({
        status: adjusted.status,
        question: adjusted.question,
        missingFields: adjusted.missingFields,
      });
    }

    const dates = [...new Set(result.drafts.map((draft) => draft.workDate))];
    stage = 'daily_minutes';
    const existingMinutes = await dependencies.dailyMinutes(user.id, dates);
    stage = 'finalize';
    const proposedMinutes = new Map<string, number>();
    for (const draft of result.drafts) {
      proposedMinutes.set(
        draft.workDate,
        (proposedMinutes.get(draft.workDate) ?? 0) + draft.durationMinutes,
      );
    }
    if (
      dates.some(
        (date) => (existingMinutes[date] ?? 0) + (proposedMinutes.get(date) ?? 0) > 1_440,
      )
    ) {
      return json({
        status: 'needs_clarification',
        question: 'El total de ese día supera 24 horas. ¿Qué duración querés corregir?',
        missingFields: ['duration'],
      });
    }

    const allowedStreamIds = new Set(recentStreams.map((stream) => stream.id));
    return json({
      status: 'ready',
      drafts: result.drafts.map((draft) => {
        const project = resolveProjectName(draft.projectName, recentStreams);
        const suggestion =
          draft.suggestedWorkStreamId && allowedStreamIds.has(draft.suggestedWorkStreamId)
            ? recentStreams.find((stream) => stream.id === draft.suggestedWorkStreamId) ?? null
            : null;
        return {
          ...draft,
          ...project,
          clientId: dependencies.createClientId(),
          existingDayMinutes: existingMinutes[draft.workDate] ?? 0,
          existingDayDate: draft.workDate,
          suggestedWorkStreamId: suggestion?.id ?? null,
          suggestedWorkStream: suggestion
            ? {
                projectName: suggestion.projectName,
                taskDescription: suggestion.taskDescription,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    dependencies.reportFailure?.({
      stage,
      kind:
        error instanceof ExtractionError
          ? error.code
          : error instanceof ExtractionDependencyError
            ? error.kind
          : error instanceof z.ZodError
            ? 'INVALID_MODEL_SHAPE'
            : 'UNEXPECTED',
    });
    return safeError(error);
  }
}

export const extractionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['needs_clarification', 'ready'] },
    question: { type: ['string', 'null'] },
    missingFields: {
      type: 'array',
      items: { type: 'string', enum: ['project', 'task', 'duration'] },
      maxItems: 3,
    },
    drafts: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          workDate: { type: 'string', format: 'date' },
          durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
          startTime: { type: ['string', 'null'] },
          endTime: { type: ['string', 'null'] },
          projectName: { type: 'string' },
          taskDescription: { type: 'string' },
          notes: { type: ['string', 'null'] },
          suggestedWorkStreamId: { type: ['string', 'null'] },
        },
        required: [
          'workDate',
          'durationMinutes',
          'startTime',
          'endTime',
          'projectName',
          'taskDescription',
          'notes',
          'suggestedWorkStreamId',
        ],
      },
    },
  },
  required: ['status', 'question', 'missingFields', 'drafts'],
} as const;

function normalizeForClarificationHeuristic(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const nonWorkingTaskSignals = [
  /\bdia feriado\b/,
  /\bferiado\b/,
  /\bferiados\b/,
  /\bvacacion\b/,
  /\bvacaciones\b/,
  /\bdescanso\b/,
  /\blicencia\b/,
  /\bpermiso\b/,
  /\bsin trabajo\b/,
  /\bdia libre\b/,
  /\bfestivo\b/,
  /\bdia no laborable\b/,
];

function isLikelyNonWorkingTask(value: string): boolean {
  const normalized = normalizeForClarificationHeuristic(value);
  if (!normalized || normalized.length > 80) {
    return false;
  }
  return nonWorkingTaskSignals.some((pattern) => pattern.test(normalized));
}

function extractLastUserClarificationAnswer(turns: z.infer<typeof turnSchema>[]): string {
  const lastUserTurn = [...turns].reverse().find((turn) => turn.role === 'user');
  if (!lastUserTurn) return '';
  const match = /Respuesta a “[^”]+”: (.*)/u.exec(lastUserTurn.content);
  if (!match) {
    const legacyMatch = /Respuesta a "[^"]+": (.*)/u.exec(lastUserTurn.content);
    return (legacyMatch?.[1] ?? lastUserTurn.content).trim();
  }
  return match[1].trim();
}

function ensureNeedProjectOnly(): string {
  return '¿En qué proyecto querías cargar esas horas?';
}

function normalizeClarificationResult(
  result: {
    status: 'needs_clarification' | 'ready';
    question: string | null;
    missingFields: string[];
  },
  turns: z.infer<typeof turnSchema>[],
) {
  if (
    result.status !== 'needs_clarification' ||
    result.missingFields.length <= 1 ||
    !result.missingFields.includes('task')
  ) {
    return result;
  }

  const latestAnswer = extractLastUserClarificationAnswer(turns);
  if (!isLikelyNonWorkingTask(latestAnswer)) {
    return result;
  }

  const nextMissingFields = result.missingFields.filter((field) => field !== 'task');
  if (nextMissingFields.length < 1) {
    return result;
  }

  return {
    ...result,
    question: ensureNeedProjectOnly(),
    missingFields: nextMissingFields as Array<'project' | 'duration' | 'task'>,
  };
}
