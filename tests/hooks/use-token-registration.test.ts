import { act, renderHook } from '@testing-library/react-native';
import { useTokenRegistration } from '@/hooks/use-token-registration';
import { registerDeviceToken } from '@/features/notifications/push-token-service';

jest.mock('@/features/notifications/push-token-service', () => ({
  registerDeviceToken: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { easConfig: { projectId: 'project-hook-id' } },
}));

const mockUseSession = jest.fn();
jest.mock('@/providers/session-provider', () => ({
  useSession: () => mockUseSession(),
}));

const mockRegister = registerDeviceToken as jest.Mock;

const noSession = { session: null, isLoading: false, sessionIdentityChanged: null };
const withSession = {
  session: {
    user: { id: 'user-1', email: 'test@example.com', created_at: '' },
    access_token: 'tok',
    refresh_token: 'ref',
    token_type: 'bearer',
    expires_in: 3600,
  },
  isLoading: false,
  sessionIdentityChanged: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue(noSession);
  mockRegister.mockResolvedValue({ status: 'registered', platform: 'ios' });
});

it('does not call registerDeviceToken when there is no session', async () => {
  await act(async () => {
    renderHook(() => useTokenRegistration());
  });
  expect(mockRegister).not.toHaveBeenCalled();
});

it('calls registerDeviceToken once when session becomes available', async () => {
  mockUseSession.mockReturnValue(withSession);
  await act(async () => {
    renderHook(() => useTokenRegistration());
  });
  expect(mockRegister).toHaveBeenCalledTimes(1);
  expect(mockRegister).toHaveBeenCalledWith('project-hook-id');
});

it('does not re-register on re-render with the same session', async () => {
  mockUseSession.mockReturnValue(withSession);
  const { rerender } = await act(async () => renderHook(() => useTokenRegistration()));
  await act(async () => {
    rerender({});
    rerender({});
  });
  expect(mockRegister).toHaveBeenCalledTimes(1);
});

it('swallows permission-denied result without throwing', async () => {
  mockRegister.mockResolvedValue({ status: 'permission-denied' });
  mockUseSession.mockReturnValue(withSession);
  await expect(
    act(async () => {
      renderHook(() => useTokenRegistration());
    }),
  ).resolves.toBeUndefined();
});

it('swallows unsupported result without throwing', async () => {
  mockRegister.mockResolvedValue({ status: 'unsupported' });
  mockUseSession.mockReturnValue(withSession);
  await expect(
    act(async () => {
      renderHook(() => useTokenRegistration());
    }),
  ).resolves.toBeUndefined();
});
