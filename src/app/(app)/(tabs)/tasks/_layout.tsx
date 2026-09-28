import { Stack } from 'expo-router';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { SwipeMenuButton } from '@/features/swipe-menu/components/swipe-menu-button';
import { View } from 'react-native';

export default function TasksLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Tareas',
          headerLeft: () => (
            <View style={{ minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
              <SwipeMenuButton />
            </View>
          ),
          headerRight: () => <SignOutButton />,
        }}
      />
    </Stack>
  );
}
