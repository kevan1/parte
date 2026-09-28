import {
  buildFallbackWorkerProfile,
  buildWorkerProfile,
  type WorkerProfileRow,
} from '@/data/profile-repository';

describe('worker profile mapping [AC-SM-8, AC-SM-9]', () => {
  const row: WorkerProfileRow = {
    created_at: '2026-08-13T18:27:04.000Z',
    email: 'kevan@example.com',
    id: 'worker-123',
    role: 'employee',
  };

  it('uses the worker name and profile photo from trusted Auth metadata', () => {
    expect(
      buildWorkerProfile(row, {
        avatar_url: 'https://example.com/avatar.png',
        full_name: 'Kevan Pérez',
      }),
    ).toEqual({
      avatarUrl: 'https://example.com/avatar.png',
      createdAt: row.created_at,
      email: row.email,
      id: row.id,
      name: 'Kevan Pérez',
      role: 'employee',
    });
  });

  it('falls back to a readable email name and rejects non-http avatar values', () => {
    const profile = buildWorkerProfile(row, {
      avatar_url: 'http://example.com/insecure-avatar.png',
      full_name: '   ',
    });

    expect(profile.name).toBe('Kevan');
    expect(profile.avatarUrl).toBeUndefined();
  });

  it('builds a safe employee profile for pre-bootstrap Auth users', () => {
    expect(
      buildFallbackWorkerProfile(
        {
          createdAt: '2026-08-10T12:00:00.000Z',
          email: 'old.user@example.com',
          id: 'legacy-worker',
        },
        {},
      ),
    ).toEqual({
      createdAt: '2026-08-10T12:00:00.000Z',
      email: 'old.user@example.com',
      id: 'legacy-worker',
      name: 'Old User',
      role: 'employee',
    });
  });
});
