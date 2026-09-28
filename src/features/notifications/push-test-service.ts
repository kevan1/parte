import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushTestErrorCode = 'permission-denied' | 'missing-project' | 'timeout' | 'network' | 'invalid-response' | 'DeviceNotRegistered' | 'InvalidCredentials' | 'push-rejected' | 'in-progress';

const messages: Record<PushTestErrorCode, string> = {
  'in-progress': 'Ya hay una prueba en curso. Esperá a que termine antes de volver a enviar.',
  'permission-denied': 'Activá las notificaciones de Parte en Ajustes y volvé a intentar.',
  'missing-project': 'Esta versión no tiene configurado el proyecto de notificaciones. Actualizá la app.',
  timeout: 'La conexión tardó demasiado. Revisá tu conexión antes de volver a intentar; el envío podría haberse realizado.',
  network: 'No se pudo consultar el servicio de notificaciones. Revisá tu conexión.',
  'invalid-response': 'El servicio devolvió una respuesta inesperada. Intentá más tarde.',
  DeviceNotRegistered: 'El dispositivo ya no está registrado. Volvé a activar la prueba desde esta app.',
  InvalidCredentials: 'Las credenciales de notificaciones de esta versión necesitan una actualización del administrador.',
  'push-rejected': 'El servicio rechazó la notificación. Intentá más tarde.',
};

export class PushTestError extends Error {
  constructor(public readonly code: PushTestErrorCode) {
    super(messages[code]);
    this.name = 'PushTestError';
  }
}

const TIMEOUT_MS = 20_000;
let sending = false;

async function bounded<T>(operation: Promise<T>, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new PushTestError('timeout'));
        }, TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function post(path: 'send' | 'getReceipts', body: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  try {
    return await bounded((async () => {
      const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new PushTestError('InvalidCredentials');
      if (!response.ok) throw new PushTestError('network');
      const payload = object(await response.json());
      if (!payload || !object(payload.data)) throw new PushTestError('invalid-response');
      return payload.data as Record<string, unknown>;
    })(), () => controller.abort());
  } catch (error) {
    throw error instanceof PushTestError ? error : new PushTestError('network');
  }
}

function rejectTicket(ticket: Record<string, unknown>): never {
  const code = object(ticket.details)?.error;
  throw new PushTestError(code === 'DeviceNotRegistered' || code === 'InvalidCredentials' ? code : 'push-rejected');
}

export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Only call in response to the user's explicit test action. Tokens stay in memory. */
export async function sendTestPush(): Promise<{ ticketId: string }> {
  if (sending) throw new PushTestError('in-progress');
  sending = true;
  try {
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== 'string' || !projectId.trim()) throw new PushTestError('missing-project');
    if (Platform.OS === 'android') {
      await bounded(Notifications.setNotificationChannelAsync('default', { name: 'Notificaciones', importance: Notifications.AndroidImportance.HIGH }));
    }
    let permission = await bounded(Notifications.getPermissionsAsync());
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) throw new PushTestError('permission-denied');
    const token = await bounded(Notifications.getExpoPushTokenAsync({ projectId }));
    if (typeof token.data !== 'string' || !/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token.data)) throw new PushTestError('invalid-response');
    const ticket = await post('send', {
      to: token.data, title: 'Parte', body: 'Esta es tu notificación de prueba.',
      sound: 'default', channelId: 'default', data: { type: 'self-device-push-test' },
    });
    if (ticket.status === 'error') rejectTicket(ticket);
    if (ticket.status !== 'ok' || typeof ticket.id !== 'string' || !ticket.id.trim()) throw new PushTestError('invalid-response');
    return { ticketId: ticket.id };
  } catch (error) {
    throw error instanceof PushTestError ? error : new PushTestError('network');
  } finally {
    sending = false;
  }
}

/** Acceptance by APNs/FCM does not prove that the notification appeared on screen. */
export async function getTestPushReceipt(ticketId: string): Promise<'pending' | 'accepted'> {
  if (!ticketId.trim()) throw new PushTestError('invalid-response');
  const receipts = await post('getReceipts', { ids: [ticketId] });
  if (!Object.prototype.hasOwnProperty.call(receipts, ticketId)) return 'pending';
  const receipt = object(receipts[ticketId]);
  if (!receipt) throw new PushTestError('invalid-response');
  if (receipt.status === 'error') rejectTicket(receipt);
  if (receipt.status !== 'ok') throw new PushTestError('invalid-response');
  return 'accepted';
}
