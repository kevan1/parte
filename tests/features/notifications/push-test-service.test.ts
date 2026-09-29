import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { configureForegroundNotifications, getTestPushReceipt, sendTestPush } from '@/features/notifications/push-test-service';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(), setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(), AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { easConfig: { projectId: 'project-own' } } }));

const mockFetch = jest.fn();
const granted = { granted: true, canAskAgain: true };
const reply = (data: unknown, ok = true, status = ok ? 200 : 500) => ({ ok, status, json: async () => data });

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockFetch.mockReset();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[own-device]' });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('only sends to the token acquired for this device and project', async () => {
  mockFetch.mockResolvedValue(reply({ data: { status: 'ok', id: 'ticket-1' } }));
  await expect(sendTestPush()).resolves.toEqual({ ticketId: 'ticket-1' });
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-own' });
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ to: 'ExponentPushToken[own-device]', title: 'Horas', body: 'Esta es tu notificación de prueba.' });
});

it('rejects concurrent sends across callers and releases the lock after completion', async () => {
  let finish!: (value: unknown) => void;
  mockFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = sendTestPush();
  await expect(sendTestPush()).rejects.toMatchObject({ code: 'in-progress' });
  for (let step = 0; step < 10 && !finish; step++) await Promise.resolve();
  expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  finish(reply({ data: { status: 'ok', id: 'ticket-1' } }));
  await expect(first).resolves.toEqual({ ticketId: 'ticket-1' });
  mockFetch.mockResolvedValue(reply({ data: { status: 'ok', id: 'ticket-2' } }));
  await expect(sendTestPush()).resolves.toEqual({ ticketId: 'ticket-2' });
});

it('releases the send lock after failure', async () => {
  mockFetch.mockRejectedValueOnce(new Error('private network details'));
  await expect(sendTestPush()).rejects.toMatchObject({ code: 'network' });
  mockFetch.mockResolvedValue(reply({ data: { status: 'ok', id: 'ticket-2' } }));
  await expect(sendTestPush()).resolves.toEqual({ ticketId: 'ticket-2' });
});

it.each([401, 403])('maps HTTP %s to a credentials error', async (status) => {
  mockFetch.mockResolvedValue(reply({}, false, status));
  await expect(sendTestPush()).rejects.toMatchObject({ code: 'InvalidCredentials' });
});

it('does not acquire a token or send when permission is denied', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
  await expect(sendTestPush()).rejects.toMatchObject({ code: 'permission-denied' });
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

it('requests permission from the explicit send action when allowed', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
  mockFetch.mockResolvedValue(reply({ data: { status: 'ok', id: 'ticket-1' } }));
  await sendTestPush();
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

it('creates the Android channel before requesting the token', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(null);
  mockFetch.mockResolvedValue(reply({ data: { status: 'ok', id: 'ticket-1' } }));
  await sendTestPush();
  expect((Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((Notifications.getExpoPushTokenAsync as jest.Mock).mock.invocationCallOrder[0]);
});

it('does not send after the permission prompt is declined', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
  await expect(sendTestPush()).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockFetch).not.toHaveBeenCalled();
});

it.each(['DeviceNotRegistered', 'InvalidCredentials'])('maps %s without exposing raw response', async (error) => {
  mockFetch.mockResolvedValue(reply({ data: { status: 'error', message: 'secret-token', details: { error } } }));
  await expect(sendTestPush()).rejects.toMatchObject({ code: error });
});

it.each([{}, { data: { status: 'ok' } }])('rejects malformed tickets', async (data) => {
  mockFetch.mockResolvedValue(reply(data));
  await expect(sendTestPush()).rejects.toMatchObject({ code: 'invalid-response' });
});

it('bounds token acquisition and does not send after its timeout', async () => {
  jest.useFakeTimers();
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockReturnValue(new Promise(() => {}));
  const result = expect(sendTestPush()).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(20_000);
  await result;
  expect(mockFetch).not.toHaveBeenCalled();
});

it('bounds an unresponsive push endpoint without resending', async () => {
  jest.useFakeTimers();
  mockFetch.mockReturnValue(new Promise(() => {}));
  const result = expect(sendTestPush()).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(20_000);
  await result;
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it('distinguishes a pending receipt from provider acceptance', async () => {
  mockFetch.mockResolvedValueOnce(reply({ data: {} })).mockResolvedValueOnce(reply({ data: { 'ticket-1': { status: 'ok' } } }));
  await expect(getTestPushReceipt('ticket-1')).resolves.toBe('pending');
  await expect(getTestPushReceipt('ticket-1')).resolves.toBe('accepted');
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
});

it('reports receipt errors and HTTP failures', async () => {
  mockFetch.mockResolvedValueOnce(reply({ data: { 'ticket-1': { status: 'error', details: { error: 'InvalidCredentials' } } } })).mockResolvedValueOnce(reply({}, false));
  await expect(getTestPushReceipt('ticket-1')).rejects.toMatchObject({ code: 'InvalidCredentials' });
  await expect(getTestPushReceipt('ticket-1')).rejects.toMatchObject({ code: 'network' });
});

it('rejects malformed receipts without inventing acceptance', async () => {
  mockFetch.mockResolvedValue(reply({ data: { 'ticket-1': {} } }));
  await expect(getTestPushReceipt('ticket-1')).rejects.toMatchObject({ code: 'invalid-response' });
});

it('configures foreground presentation without requesting permission', async () => {
  configureForegroundNotifications();
  const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
  await expect(handler.handleNotification()).resolves.toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
