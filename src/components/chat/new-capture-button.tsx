import { SymbolView } from 'expo-symbols';
import { Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

import { colors } from '@/theme/tokens';

type NewCaptureButtonProps = {
  disabled?: boolean;
  onPress: () => void;
};

export function NewCaptureButton({ disabled = false, onPress }: NewCaptureButtonProps) {
  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Nuevo registro"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        { opacity: disabled ? 0.3 : 1 },
        !disabled && pressed ? { transform: [{ scale: 0.94 }] } : null,
      ]}
    >
      <SymbolView
        name={{ ios: 'plus', android: 'add', web: 'add' }}
        size={23}
        tintColor={colors.label}
        fallback={
          <Text style={{ color: colors.label, fontSize: 24, lineHeight: 22, marginTop: -2 }}>+</Text>
        }
      />
    </Pressable>
  );
}
