import type { Session } from '@supabase/supabase-js';
import { act, render } from '@testing-library/react-native';

import type { WorkerProfile } from '@/data/profile-repository';
import { ProfileScreen } from '@/features/profile/profile-screen';

const mockGetWorkerProfile = jest.fn<Promise<WorkerProfile>, unknown[]>();
let mockSession: Session;

jest.mock('@/data/profile-repository', () => ({
  ...jest.requireActual('@/data/profile-repository'),
  getWorkerProfile: (...args: unknown[]) => mockGetWorkerProfile(...args),
}));

jest.mock('@/providers/session-provider', () => ({
  useSession: () => ({ isLoading: false, session: mockSession }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function sessionFor(id: string, email: string): Session {
  const createdAt = '2026-08-10T12:00:00.000Z';
  return {
    access_token: `access-${id}`,
    expires_at: 2_000_000_000,
    expires_in: 3600,
    refresh_token: `refresh-${id}`,
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: createdAt,
      email,
      id,
      user_metadata: {},
    },
  };
}

function profileFor(id: string, email: string, name: string): WorkerProfile {
  return {
    createdAt: '2026-08-10T12:00:00.000Z',
    email,
    id,
    name,
    role: 'employee',
  };
}

describe('profile session isolation [AC-SM-9, AC-SM-10]', () => {
  beforeEach(() => {
    mockGetWorkerProfile.mockReset();
  });

  it('clears the prior worker and ignores their late response after a session change', async () => {
    const userA = deferred<WorkerProfile>();
    const userB = deferred<WorkerProfile>();
    mockGetWorkerProfile.mockReturnValueOnce(userA.promise).mockReturnValueOnce(userB.promise);
    mockSession = sessionFor('worker-a', 'a@example.com');
    const view = await render(<ProfileScreen />);

    mockSession = sessionFor('worker-b', 'b@example.com');
    await act(async () => view.rerender(<ProfileScreen />));

    expect(view.queryByText('Trabajador A')).toBeNull();
    expect(view.getByLabelText('Cargando tu perfil')).toBeTruthy();

    await act(async () => userB.resolve(profileFor('worker-b', 'b@example.com', 'Trabajador B')));
    expect(view.getByText('Trabajador B')).toBeTruthy();

    await act(async () => userA.resolve(profileFor('worker-a', 'a@example.com', 'Trabajador A')));
    expect(view.queryByText('Trabajador A')).toBeNull();
    expect(view.getByText('Trabajador B')).toBeTruthy();
  });
});
