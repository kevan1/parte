import type { LocalEvidenceAttachment, WorkEvidence } from '@/domain/types';
import { RepositoryError } from '@/data/repository-error';
import { supabase } from '@/data/supabase';

const BUCKET = 'work-evidence';
const MAX_FILE_SIZE = 6 * 1024 * 1024;

type WorkEvidenceRow = {
  id: string;
  user_id: string;
  work_stream_id: string;
  source_asset_id: string;
  storage_path: string;
  original_filename: string | null;
  source_created_at: string | null;
  mime_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

function mimeTypeForFilename(filename: string): { mimeType: string; extension: string } {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return { mimeType: 'image/png', extension: 'png' };
    case 'heic':
    case 'heif':
      return { mimeType: 'image/heic', extension: 'heic' };
    case 'webp':
      return { mimeType: 'image/webp', extension: 'webp' };
    default:
      return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
}

function safeAssetName(assetId: string): string {
  return assetId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-180);
}

function mapEvidence(row: WorkEvidenceRow, signedUrl: string | null = null): WorkEvidence {
  return {
    id: row.id,
    userId: row.user_id,
    workStreamId: row.work_stream_id,
    sourceAssetId: row.source_asset_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    sourceCreatedAt: row.source_created_at,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    signedUrl,
  };
}

async function currentEvidenceKeys(userId: string, workStreamIds: string[]): Promise<Set<string>> {
  if (workStreamIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('work_evidence')
    .select('work_stream_id,source_asset_id')
    .eq('user_id', userId)
    .in('work_stream_id', workStreamIds);
  if (error) throw new RepositoryError('EVIDENCE_READ_FAILED', 'No pudimos revisar las evidencias.', true);

  return new Set(
    ((data ?? []) as { work_stream_id: string; source_asset_id: string }[]).map(
      (row) => `${row.work_stream_id}:${row.source_asset_id}`,
    ),
  );
}

/** Uploads local library assets and records them once per work stream. */
export async function persistWorkEvidence(
  workStreamIds: string[],
  attachments: LocalEvidenceAttachment[],
): Promise<void> {
  if (workStreamIds.length === 0 || attachments.length === 0) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    throw new RepositoryError('EVIDENCE_AUTH_FAILED', 'Tu sesión expiró. Iniciá sesión nuevamente.', true);
  }

  const streamIds = [...new Set(workStreamIds)];
  const existing = await currentEvidenceKeys(userId, streamIds);
  const rows: Omit<WorkEvidenceRow, 'id' | 'created_at' | 'user_id'>[] = [];
  // Keep this native module lazy: most capture operations do not contain
  // attachments, and the repository must remain usable in non-media tests and
  // environments where the photo library module is unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Asset } = require('expo-media-library') as typeof import('expo-media-library');

  try {
    for (const workStreamId of streamIds) {
      for (const attachment of attachments) {
        const key = `${workStreamId}:${attachment.id}`;
        if (existing.has(key)) continue;

        const info = await new Asset(attachment.id).getInfo();
        const filename = info.filename || attachment.fileName || `evidence-${Date.now()}.jpg`;
        const { mimeType, extension } = mimeTypeForFilename(filename);
        const response = await fetch(info.uri);
        if (!response.ok) {
          throw new Error(`Could not read evidence asset (${response.status}).`);
        }
        const body = await response.arrayBuffer();
        if (body.byteLength > MAX_FILE_SIZE) {
          throw new RepositoryError(
            'EVIDENCE_TOO_LARGE',
            'Una de las fotos supera el límite de 6 MB. Elegí una versión más liviana.',
          );
        }

        const storagePath = `${userId}/${workStreamId}/${safeAssetName(attachment.id)}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, body, {
          contentType: mimeType,
          upsert: true,
        });
        if (uploadError) throw uploadError;

        rows.push({
          work_stream_id: workStreamId,
          source_asset_id: attachment.id,
          storage_path: storagePath,
          original_filename: filename,
          source_created_at: attachment.creationTime
            ? new Date(attachment.creationTime).toISOString()
            : null,
          mime_type: mimeType,
          byte_size: body.byteLength || null,
          width: info.width || attachment.width,
          height: info.height || attachment.height,
        });
      }
    }
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError('EVIDENCE_UPLOAD_FAILED', 'Las horas se guardaron, pero no pudimos subir las fotos. Reintentá.', true);
  }

  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from('work_evidence').insert(
    rows.map((row) => ({ ...row, user_id: userId })),
  );
  if (insertError) {
    throw new RepositoryError('EVIDENCE_SAVE_FAILED', 'Las fotos se subieron, pero no pudimos asociarlas a la tarea. Reintentá.', true);
  }
}

export async function listWorkEvidence(workStreamId: string): Promise<WorkEvidence[]> {
  const { data, error } = await supabase
    .from('work_evidence')
    .select(
      'id,user_id,work_stream_id,source_asset_id,storage_path,original_filename,source_created_at,mime_type,byte_size,width,height,created_at',
    )
    .eq('work_stream_id', workStreamId)
    .order('created_at', { ascending: false });
  if (error) throw new RepositoryError('EVIDENCE_READ_FAILED', 'No pudimos cargar las fotos de la tarea.', true);

  const rows = (data ?? []) as WorkEvidenceRow[];
  return Promise.all(
    rows.map(async (row) => {
      const { data: signedData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path, 60 * 60);
      return mapEvidence(row, signedData?.signedUrl ?? null);
    }),
  );
}
