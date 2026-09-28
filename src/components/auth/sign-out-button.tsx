import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { authService } from '@/data/supabase';
import { resetUserState } from '@/state/reset-user-state';
import { colors } from '@/theme/tokens';

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cerrar sesión"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      hitSlop={10}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setBusy(true);
        void authService
          .signOut()
          .then(() => {
            resetUserState();
            router.replace('/sign-in');
          })
          .catch(() => Alert.alert('No pudimos cerrar la sesión', 'Intentá nuevamente.'))
          .finally(() => setBusy(false));
      }}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: 'flex-end',
        justifyContent: 'center',
        opacity: busy ? 0.45 : pressed ? 0.55 : 1,
        transform: pressed && !busy ? [{ scale: 0.96 }] : [{ scale: 1 }],
      })}
    >
      <Text style={{ color: colors.accent, opacity: busy ? 0.45 : 1 }}>Salir</Text>
    </Pressable>
  );
}
