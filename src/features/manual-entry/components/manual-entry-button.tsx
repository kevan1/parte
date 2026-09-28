import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Pressable } from 'react-native';

import { colors } from '@/theme/tokens';

type ManualEntryButtonProps = {
  disabled?: boolean;
};

export function ManualEntryButton({ disabled = false }: ManualEntryButtonProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityLabel="Nueva carga manual"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/new-entry');
      }}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          minWidth: 44,
          opacity: disabled ? 0.3 : 1,
        },
        !disabled && pressed ? { transform: [{ scale: 0.96 }] } : null,
      ]}
    >
      <SymbolView
        fallback={null}
        name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
        size={23}
        tintColor={colors.label}
      />
    </Pressable>
  );
}
