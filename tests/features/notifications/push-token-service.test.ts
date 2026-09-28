import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerDeviceToken, removeStaleDeviceToken } from '@/features/notifications/push-token-service';
import { supabase } from '@/data/supabase';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { easConfig: { projectId: 'project-test-id' } },
}));
jest.mock('@/data/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockRpc = supabase.rpc as jest.Mock;
const granted = { granted: true, canAskAgain: true };

beforeEach(() => {
  jest.clearAllMocks();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
    data: 'ExponentPushToken[test-device-1]',
  });
  mockRpc.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('returns registered on happy path and calls RPC with token and platform', async () => {
  const result = await registerDeviceToken('project-test-id');
  expect(result).toEqual({ status: 'registered', platform: 'ios' });
  expect(mockRpc).toHaveBeenCalledWith('register_device_token', {
    p_token: 'ExponentPushToken[test-device-1]',
    p_platform: 'ios',
  });
});

it('returns permission-denied when permission not granted and does not call RPC', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    canAskAgain: false,
  });
  const result = await registerDeviceToken('project-test-id');
  expect(result).toEqual({ status: 'permission-denied' });
  expect(mockRpc).not.toHaveBeenCalled();
});

it('requests permission when canAskAgain is true and then registers', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    canAskAgain: true,
  });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  const result = await registerDeviceToken('project-test-id');
  expect(result.status).toBe('registered');
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

it('returns permission-denied when prompt is declined and does not call RPC', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    canAskAgain: true,
  });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    canAskAgain: false,
  });
  const result = await registerDeviceToken('project-test-id');
  expect(result).toEqual({ status: 'permission-denied' });
  expect(mockRpc).not.toHaveBeenCalled();
});

it('returns unsupported on web platform without requesting permissions', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const result = await registerDeviceToken('project-test-id');
  expect(result).toEqual({ status: 'unsupported' });
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

it('returns error with reason invalid-token when token regex does not match and does not call RPC', async () => {
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
    data: 'not-a-valid-expo-token',
  });
  const result = await registerDeviceToken('project-test-id');
  expect(result).toEqual({ status: 'error', reason: 'invalid-token' });
  expect(mockRpc).not.toHaveBeenCalled();
});

it('returns error when RPC fails and does not include token value in error reason', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });
  const result = await registerDeviceToken('project-test-id');
  expect(result.status).toBe('error');
  if (result.status === 'error') {
    expect(result.reason).not.toContain('ExponentPushToken[test-device-1]');
  }
});

it('creates Android channel before requesting the token', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(null);
  await registerDeviceToken('project-test-id');
  const channelOrder =
    (Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0];
  const tokenOrder =
    (Notifications.getExpoPushTokenAsync as jest.Mock).mock.invocationCallOrder[0];
  expect(channelOrder).toBeLessThan(tokenOrder);
});

it('removeStaleDeviceToken calls remove RPC and silently ignores success', async () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  await expect(removeStaleDeviceToken('ExponentPushToken[stale-1]')).resolves.toBeUndefined();
  expect(mockRpc).toHaveBeenCalledWith('remove_stale_device_token', {
    p_token: 'ExponentPushToken[stale-1]',
  });
});

it('removeStaleDeviceToken silently ignores RPC failures', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } });
  await expect(removeStaleDeviceToken('ExponentPushToken[stale-2]')).resolves.toBeUndefined();
});

it('removeStaleDeviceToken silently ignores thrown errors', async () => {
  mockRpc.mockRejectedValue(new Error('network down'));
  await expect(removeStaleDeviceToken('ExponentPushToken[stale-3]')).resolves.toBeUndefined();
});
