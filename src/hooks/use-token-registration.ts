import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';

import { registerDeviceToken } from '@/features/notifications/push-token-service';
import { useSession } from '@/providers/session-provider';

/**
 * Runs once per authenticated session to request push notification permission
 * and register the device token with the server. Silent on failure.
 */
export const useTokenRegistration = (): void => {
  const { session } = useSession();
  const registered = useRef(false);

  useEffect(() => {
    if (!session || registered.current) return;
    registered.current = true;

    const projectId =
      Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== 'string' || !projectId.trim()) return;

    void registerDeviceToken(projectId);
  }, [session]);
};
