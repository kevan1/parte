import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useOnboardingStore } from '@/data/onboarding-store';
import { colors } from '@/theme/tokens';

export default function AuthLayout() {
  const { status, completed, hydrate } = useOnboardingStore();
  useEffect(() => {
    if (status === 'idle') void hydrate();
  }, [status, hydrate]);

  if (status === 'error') return <Redirect href="/" />;
  if (status !== 'ready') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator accessibilityLabel="Cargando inicio" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', headerShadowVisible: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Protected guard={!completed}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
