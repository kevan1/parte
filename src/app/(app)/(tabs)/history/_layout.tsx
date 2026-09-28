import { Stack } from 'expo-router';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { ManualEntryButton } from '@/features/manual-entry/components/manual-entry-button';
import { SwipeMenuButton } from '@/features/swipe-menu/components/swipe-menu-button';
import { spacing } from '@/theme/tokens';
import { View } from 'react-native';

export default function HistoryLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Mis horas',
          headerLeft: () => (
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md }}>
              <ManualEntryButton />
              <SwipeMenuButton />
            </View>
          ),
          headerRight: () => <SignOutButton />,
        }}
      />
    </Stack>
  );
}
