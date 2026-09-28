import { useEffect } from 'react';
import { AvailabilityProvider } from '@/features/availability/availability-session-provider';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { SwipeMenuShell } from '@/features/swipe-menu/swipe-menu-shell';
import { configureForegroundNotifications } from '@/features/notifications/push-test-service';
import { useTokenRegistration } from '@/hooks/use-token-registration';
import { colors } from '@/theme/tokens';

type NotificationData = {
  type?: string;
  workStreamId?: string;
};

export default function AppLayout() {
  const isIos = process.env.EXPO_OS === 'ios';
  const router = useRouter();

  // Register push token once session is available.
  useTokenRegistration();

  // Configure foreground notification banners for the full authenticated context.
  useEffect(() => {
    configureForegroundNotifications();
  }, []);

  // Handle notification taps: route task-assignment notifications to the tasks tab.
  useEffect(() => {
    const handleNotificationResponse = (
      response: Notifications.NotificationResponse | null,
    ): void => {
      const data = response?.notification.request.content.data as NotificationData | undefined;
      if (data?.type === 'task-assignment') {
        router.replace('/tasks');
      }
    };

    // Handle tap that launched the app from a cold start.
    void Notifications.getLastNotificationResponseAsync().then(handleNotificationResponse);

    // Handle taps while the app is already running.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    return () => subscription.remove();
  }, [router]);

  return (
    <AvailabilityProvider><SwipeMenuShell>
      <Stack>
        <Stack.Screen name="availability" options={{ title: 'Tu disponibilidad', presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: colors.background } }} />
        <Stack.Screen name="schedules" options={{ title: 'Jornadas' }} />
        <Stack.Screen name="assign-task" options={{ title: 'Asignar tarea', headerBackTitle: 'Atrás' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="entry/[id]"
          options={{
            title: 'Editar entrada',
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            title: 'Mi perfil',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="new-entry"
          options={{
            title: 'Nueva carga',
            headerShown: isIos,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.72, 1],
            sheetInitialDetentIndex: 0,
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
            contentStyle: { backgroundColor: colors.surface },
            headerLargeTitle: false,
            headerTitleAlign: 'center',
          }}
        />
      </Stack>
    </SwipeMenuShell></AvailabilityProvider>
  );
}
