import { supabase } from '@/data/supabase';

export type WorkerRole = 'employee' | 'admin' | 'external';

export type WorkerProfileRow = {
  created_at: string;
  email: string;
  id: string;
  role: WorkerRole;
};

export type WorkerProfile = {
  avatarUrl?: string;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: WorkerRole;
};

export type WorkerAuthIdentity = {
  createdAt: string;
  email: string;
  id: string;
};

function metadataText(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validAvatarUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function nameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  const words = localPart.split(/[._-]+/).filter(Boolean);
  const name = words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
  return name || 'Trabajador';
}

export function buildWorkerProfile(
  row: WorkerProfileRow,
  metadata: Record<string, unknown>,
): WorkerProfile {
  const name =
    metadataText(metadata, 'full_name') ??
    metadataText(metadata, 'name') ??
    nameFromEmail(row.email);
  const avatarUrl = validAvatarUrl(
    metadataText(metadata, 'avatar_url') ?? metadataText(metadata, 'picture'),
  );

  return {
    ...(avatarUrl ? { avatarUrl } : {}),
    createdAt: row.created_at,
    email: row.email,
    id: row.id,
    name,
    role: row.role,
  };
}

export function buildFallbackWorkerProfile(
  identity: WorkerAuthIdentity,
  metadata: Record<string, unknown>,
): WorkerProfile {
  return buildWorkerProfile(
    {
      created_at: identity.createdAt,
      email: identity.email,
      id: identity.id,
      role: 'employee',
    },
    metadata,
  );
}

export async function getWorkerProfile(
  identity: WorkerAuthIdentity,
  metadata: Record<string, unknown>,
): Promise<WorkerProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role,created_at')
    .eq('id', identity.id)
    .single();

  if (error?.code === 'PGRST116') return buildFallbackWorkerProfile(identity, metadata);
  if (error || !data) throw error ?? new Error('No se encontró el perfil.');
  return buildWorkerProfile(data as WorkerProfileRow, metadata);
}
