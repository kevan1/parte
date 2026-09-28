import { secureSessionStorage } from '@/data/secure-storage';

const SESSION_IDENTITY_KEY = 'parte.lastSessionIdentity';

export type SessionIdentity = {
  userId: string;
  email: string | null;
};

function parseIdentity(raw: string | null): SessionIdentity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: string; email?: string | null };
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    return {
      userId: parsed.userId.trim(),
      email: typeof parsed.email === 'string' ? parsed.email.trim() : null,
    };
  } catch {
    return null;
  }
}

export async function getLastSessionIdentity(): Promise<SessionIdentity | null> {
  return parseIdentity(await secureSessionStorage.getItem(SESSION_IDENTITY_KEY));
}

export async function setLastSessionIdentity(identity: SessionIdentity): Promise<void> {
  await secureSessionStorage.setItem(SESSION_IDENTITY_KEY, JSON.stringify(identity));
}
