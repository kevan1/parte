import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type FormFieldProps = TextInputProps & {
  label: string;
  required?: boolean;
  error?: string | null;
};

export function FormField({ label, required = false, error, style, ...props }: FormFieldProps) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.label, fontSize: 14, fontWeight: '600' }}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={required ? 'Campo obligatorio' : undefined}
        style={[
          {
            minHeight: props.multiline ? 92 : 48,
            borderRadius: radius.sm,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: error ? colors.destructive : colors.separator,
            backgroundColor: colors.input,
            color: colors.label,
            fontSize: 16,
            paddingHorizontal: 12,
            paddingVertical: 12,
          },
          style,
        ]}
        placeholderTextColor={colors.tertiaryLabel}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" selectable style={{ color: colors.destructive, fontSize: 13 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
