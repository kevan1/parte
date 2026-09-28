import { createStore } from 'zustand/vanilla';

import type {
  CaptureTurn,
  EditableTimeEntryDraft,
  ExtractResponse,
  LocalEvidenceAttachment,
  TimeEntry,
} from '@/domain/types';
import { decimalHoursToMinutes, formatDecimalHours } from '@/domain/time-normalization';
import { todayInTimeZone } from '@/domain/week-summary';

export type CapturePhase =
  | 'idle'
  | 'extracting'
  | 'clarifying'
  | 'ready'
  | 'saving'
  | 'saved'
  | 'error';

export type CaptureDependencies = {
  extract: (turns: CaptureTurn[], signal?: AbortSignal) => Promise<ExtractResponse>;
  confirm: (
    submissionId: string,
    drafts: EditableTimeEntryDraft[],
    attachments?: LocalEvidenceAttachment[],
  ) => Promise<TimeEntry[]>;
  createSubmissionId: () => string;
  onConfirmed?: () => void;
};

export type CaptureState = {
  phase: CapturePhase;
  turns: CaptureTurn[];
  drafts: EditableTimeEntryDraft[];
  submissionId: string | null;
  failedInput: string | null;
  errorMessage: string | null;
  savedEntries: TimeEntry[];
  attachments: LocalEvidenceAttachment[];
  submit: (text: string, attachments?: LocalEvidenceAttachment[]) => Promise<void>;
  updateDraft: (index: number, patch: Partial<EditableTimeEntryDraft>) => void;
  acceptSuggestion: (index: number) => void;
  useNewStream: (index: number) => void;
  confirm: () => Promise<void>;
  reset: () => void;
};

const initialState = {
  phase: 'idle' as const,
  turns: [] as CaptureTurn[],
  drafts: [] as EditableTimeEntryDraft[],
  submissionId: null as string | null,
  failedInput: null as string | null,
  errorMessage: null as string | null,
  savedEntries: [] as TimeEntry[],
  attachments: [] as LocalEvidenceAttachment[],
};

function calendarDateIsValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function draftIsValid(draft: EditableTimeEntryDraft, today: string): boolean {
  try {
    return (
      Boolean(draft.projectName.trim()) &&
      Boolean(draft.taskDescription.trim()) &&
      calendarDateIsValid(draft.workDate) &&
      draft.workDate <= today &&
      draft.existingDayDate === draft.workDate &&
      Number.isInteger(draft.existingDayMinutes) &&
      decimalHoursToMinutes(draft.durationInput) === draft.durationMinutes &&
      draft.continuityChoice !== 'pending'
    );
  } catch {
    return false;
  }
}

export function canConfirmDrafts(
  drafts: EditableTimeEntryDraft[],
  today = todayInTimeZone(),
): boolean {
  const minutesByDate = new Map<string, number>();
  for (const draft of drafts) {
    if (!draftIsValid(draft, today)) return false;
    const nextTotal =
      (minutesByDate.get(draft.workDate) ?? draft.existingDayMinutes ?? 0) +
      draft.durationMinutes;
    if (nextTotal > 1_440) return false;
    minutesByDate.set(draft.workDate, nextTotal);
  }
  return drafts.length > 0;
}

export function createCaptureStore(dependencies: CaptureDependencies) {
  let generation = 0;
  let modelTurns: CaptureTurn[] = [];
  let pendingQuestion: string | null = null;
  let extractionController: AbortController | null = null;

  return createStore<CaptureState>((set, get) => ({
    ...initialState,

    submit: async (text, attachments = []) => {
      const normalized = text.trim();
      if (!normalized || normalized.length > 2_000 || get().phase === 'extracting') return;
      const retainedAttachments = attachments.length > 0 ? attachments : get().attachments;
      const previousTurns = get().turns;
      const turns = [
        ...previousTurns,
        {
          role: 'user' as const,
          content: normalized,
          ...(attachments.length > 0 ? { attachments } : {}),
        },
      ].slice(-8);
      const answerPrefix = pendingQuestion ? `Respuesta a “${pendingQuestion}”: ` : '';
      const modelContent =
        answerPrefix && answerPrefix.length + normalized.length <= 2_000
          ? `${answerPrefix}${normalized}`
          : normalized;
      const extractionTurns = [
        ...modelTurns,
        { role: 'user' as const, content: modelContent },
      ].slice(-8);
      const requestGeneration = generation;
      const controller = new AbortController();
      extractionController = controller;
      set({
        phase: 'extracting',
        turns,
        attachments: retainedAttachments,
        failedInput: null,
        errorMessage: null,
      });
      try {
        const response = await dependencies.extract(extractionTurns, controller.signal);
        if (requestGeneration !== generation) return;
        if (response.status === 'needs_clarification') {
          modelTurns = extractionTurns;
          pendingQuestion = response.question;
          set({
            phase: 'clarifying',
            turns: [
              ...turns,
              { role: 'assistant' as const, content: response.question },
            ].slice(-8),
            drafts: [],
            attachments: retainedAttachments,
          });
          return;
        }
        modelTurns = extractionTurns;
        pendingQuestion = null;
        set({
          phase: 'ready',
          drafts: response.drafts.map((draft) => ({
            ...draft,
            durationInput: formatDecimalHours(draft.durationMinutes),
            selectedWorkStreamId: null,
            continuityChoice: draft.suggestedWorkStreamId ? 'pending' : 'new',
          })),
          submissionId: dependencies.createSubmissionId(),
          attachments: retainedAttachments,
        });
      } catch (error) {
        if (requestGeneration !== generation) return;
        set({
          phase: 'error',
          turns: previousTurns,
          failedInput: normalized,
          errorMessage:
            error instanceof Error && error.name === 'RepositoryError'
              ? error.message
              : 'Revisá tu conexión e intentá nuevamente.',
        });
      } finally {
        if (extractionController === controller) extractionController = null;
      }
    },

    updateDraft: (index, patch) =>
      set((state) => ({
        drafts: state.drafts.map((draft, position) =>
          position === index
            ? {
                ...draft,
                ...patch,
                ...('projectName' in patch ? { projectSuggestion: null } : {}),
                ...(('projectName' in patch || 'taskDescription' in patch) &&
                draft.suggestedWorkStreamId
                  ? { selectedWorkStreamId: null, continuityChoice: 'pending' as const }
                  : {}),
              }
            : draft,
        ),
      })),

    acceptSuggestion: (index) =>
      set((state) => ({
        drafts: state.drafts.map((draft, position) =>
          position === index
            ? {
                ...draft,
                selectedWorkStreamId: draft.suggestedWorkStreamId,
                continuityChoice: 'existing',
              }
            : draft,
        ),
      })),

    useNewStream: (index) =>
      set((state) => ({
        drafts: state.drafts.map((draft, position) =>
          position === index
            ? { ...draft, selectedWorkStreamId: null, continuityChoice: 'new' }
            : draft,
        ),
      })),

    confirm: async () => {
      const { drafts, submissionId } = get();
      if (
        !submissionId ||
        drafts.length === 0 ||
        !canConfirmDrafts(drafts) ||
        get().phase === 'saving'
      ) {
        return;
      }
      const requestGeneration = generation;
      set({ phase: 'saving', errorMessage: null });
      try {
        const attachments = get().attachments;
        const savedEntries =
          attachments.length > 0
            ? await dependencies.confirm(submissionId, drafts, attachments)
            : await dependencies.confirm(submissionId, drafts);
        if (requestGeneration !== generation) return;
        set({ phase: 'saved', savedEntries, attachments: [] });
        dependencies.onConfirmed?.();
      } catch (error) {
        if (requestGeneration !== generation) return;
        set({
          phase: 'ready',
          errorMessage:
            error instanceof Error && error.name === 'RepositoryError'
              ? error.message
              : 'No pudimos guardar las horas. Intentá nuevamente.',
        });
      }
    },

    reset: () => {
      extractionController?.abort();
      extractionController = null;
      generation += 1;
      modelTurns = [];
      pendingQuestion = null;
      set({ ...initialState });
    },
  }));
}
