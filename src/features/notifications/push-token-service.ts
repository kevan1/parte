import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/data/supabase';

/** Broad platform type matching Expo push token platform values. */
type SupportedPlatform = 'ios' | 'android' | 'web';

export type TokenRegistrationResult =
  | { status: 'registered'; platform: SupportedPlatform }
  | { status: 'permission-denied' }
  | { status: 'unsupported' }
  | { status: 'error'; reason: string };

const TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

/**
 * Call once after an authenticated session exists.
 * Requests notification permission, acquires the Expo push token,
 * and registers it with the server via RPC. Silent on failure.
 */
export const registerDeviceToken = async (
  projectId: string,
): Promise<TokenRegistrationResult> => {
  if (Platform.OS === 'web') {
    return { status: 'unsupported' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notificaciones',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    return { status: 'permission-denied' };
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (typeof token.data !== 'string' || !TOKEN_REGEX.test(token.data)) {
    return { status: 'error', reason: 'invalid-token' };
  }

  const { error } = await supabase.rpc('register_device_token', {
    p_token: token.data,
    p_platform: Platform.OS as SupportedPlatform,
  });

  if (error) {
    // Do not include the token value in the reason string.
    return { status: 'error', reason: error.message };
  }

  return { status: 'registered', platform: Platform.OS as SupportedPlatform };
};

/**
 * Call when Expo returns DeviceNotRegistered for a specific token.
 * Silent failure — never throws.
 */
export const removeStaleDeviceToken = async (token: string): Promise<void> => {
  try {
    await supabase.rpc('remove_stale_device_token', { p_token: token });
  } catch {
    // Intentionally swallow all errors.
  }
};
