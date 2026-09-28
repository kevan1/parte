import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type PrimaryButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
  variant?: 'filled' | 'soft' | 'plain';
};

export function PrimaryButton({
  label,
  loading = false,
  variant = 'filled',
  disabled,
  onPress,
  style,
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const handlePress: PressableProps['onPress'] = onPress
    ? (event) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(event);
      }
    : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          paddingHorizontal: spacing.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            variant === 'filled'
              ? colors.accent
              : variant === 'soft'
                ? colors.accentSurface
                : 'transparent',
          opacity: isDisabled ? 0.45 : pressed ? 0.72 : 1,
          transform: !isDisabled && pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
        },
        typeof style === 'function' ? style({ pressed, hovered: false }) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'filled' ? colors.background : colors.accent} />
      ) : (
        <Text
          style={{
            color: variant === 'filled' ? colors.background : colors.accent,
            fontSize: 17,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
