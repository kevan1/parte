import { render } from '@testing-library/react-native';

import { HistoryScreen } from '@/screens/history-screen';

const mockLoadHistory = jest.fn();

jest.mock('@/state/history', () => ({
  historyStore: {
    getState: () => ({ load: mockLoadHistory }),
  },
  useHistoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: 'success',
      entries: [],
      errorMessage: null,
      isStale: false,
    }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useFocusEffect: (callback: () => unknown) => {
    callback();
  },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/providers/session-provider', () => ({
  useSession: jest.fn().mockReturnValue({ sessionIdentityChanged: null }),
}));

describe('history screen [AC-SM-11]', () => {
  it('shows current-user migration hint when entries are missing after a session change', async () => {
    (require('@/providers/session-provider').useSession as jest.Mock).mockReturnValue({
      sessionIdentityChanged: {
        previousUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        previousEmail: 'anterior@empresa.com',
        currentUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        currentEmail: 'actual@empresa.com',
      },
    });
    const view = await render(<HistoryScreen />);

    expect(
      view.getByText(/Entraste con otro usuario/),
    ).toBeTruthy();
    expect(mockLoadHistory).toHaveBeenCalledTimes(1);
    expect(view.getByText('Detectamos un cambio de cuenta.')).toBeTruthy();
  });

  it('does not show migration hint when account remains stable', async () => {
    (require('@/providers/session-provider').useSession as jest.Mock).mockReturnValue({ sessionIdentityChanged: null });
    const view = await render(<HistoryScreen />);

    expect(view.queryByText('Detectamos un cambio de cuenta.')).toBeNull();
    expect(view.getByText('Todavía no cargaste horas')).toBeTruthy();
  });
});
