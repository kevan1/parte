import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useOnboardingStore } from '@/data/onboarding-store';
import { useSession } from '@/providers/session-provider';
import { colors, spacing } from '@/theme/tokens';

export default function IndexRoute() {
  const { session } = useSession();
  const { status, completed, error, hydrate } = useOnboardingStore();

  useEffect(() => {
    if (!session && status === 'idle') void hydrate();
  }, [session, status, hydrate]);

  if (session) return <Redirect href="/register" />;
  if (status === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background }}>
        <Text accessibilityRole="alert" style={{ color: colors.label, fontSize: 17 }}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => void hydrate()} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.label, fontSize: 17, fontWeight: '600' }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  if (status !== 'ready') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator accessibilityLabel="Cargando inicio" />
      </View>
    );
  }
  return <Redirect href={completed ? '/sign-in' : '/onboarding'} />;
}
