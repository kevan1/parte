export type CaptureRole = 'user' | 'assistant';

export type CaptureTurn = {
  role: CaptureRole;
  content: string;
  attachments?: LocalEvidenceAttachment[];
};

export type LocalEvidenceAttachment = {
  /** Stable device-library identifier used to resolve the local file at upload time. */
  id: string;
  fileName: string | null;
  width: number | null;
  height: number | null;
  creationTime: number | null;
};

export type WorkEvidence = {
  id: string;
  userId: string;
  workStreamId: string;
  sourceAssetId: string;
  storagePath: string;
  originalFilename: string | null;
  sourceCreatedAt: string | null;
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  signedUrl?: string | null;
};

export type MissingField = 'project' | 'task' | 'duration';

export type TimeEntryDraft = {
  clientId: string;
  workDate: string;
  durationMinutes: number;
  startTime: string | null;
  endTime: string | null;
  projectName: string;
  projectSuggestion?: {
    inputName: string;
    existingName: string;
  } | null;
  taskDescription: string;
  notes: string | null;
  requesterType?: TaskRequesterType | null;
  requesterName?: string | null;
  materials?: string[];
  suggestedWorkStreamId: string | null;
  suggestedWorkStream?: {
    projectName: string;
    taskDescription: string;
  } | null;
  existingDayMinutes?: number;
  existingDayDate?: string;
};

export type EditableTimeEntryDraft = TimeEntryDraft & {
  durationInput: string;
  selectedWorkStreamId: string | null;
  continuityChoice: 'pending' | 'existing' | 'new';
};

export type ExtractResponse =
  | {
      status: 'needs_clarification';
      question: string;
      missingFields: MissingField[];
    }
  | {
      status: 'ready';
      drafts: TimeEntryDraft[];
    };

export type WorkStream = {
  id: string;
  userId: string;
  projectName: string;
  taskDescription: string;
  lastUsedAt: string;
  status: 'open' | 'completed';
  completedAt: string | null;
  projectTotalMinutes?: number;
  requesterType?: TaskRequesterType | null;
  requesterName?: string | null;
  materials?: string[];
};

export type TaskRequesterType = 'sector' | 'line' | 'person';

export type AssignableEmployee = {
  id: string;
  email: string;
  name: string;
};

export type AssignTaskParams = {
  assigneeId: string;
  projectName: string;
  taskDescription: string;
  requesterType?: TaskRequesterType | null;
  requesterName?: string | null;
  materials?: string[] | null;
};

export type AssignTaskResult = {
  workStreamId: string;
  tokenCount: number;
};

export type TimeEntry = {
  id: string;
  userId: string;
  workStreamId: string;
  workDate: string;
  durationMinutes: number;
  startTime: string | null;
  endTime: string | null;
  projectName: string;
  taskDescription: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  evidenceCount?: number;
};
