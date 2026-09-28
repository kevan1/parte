import { StyleSheet, Text } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { colors, spacing } from '@/theme/tokens';

export function CaptureEmptyState({ keyboardProgress }: { keyboardProgress?: SharedValue<number> }) {
  const fallback = useSharedValue(0);
  const progress = keyboardProgress ?? fallback;
  const exampleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={styles.container}>
      <Text testID="capture-empty-title" selectable style={styles.title}>¿Qué hiciste hoy?</Text>
      <Text selectable style={styles.subtitle}>Anotá tu actividad y el tiempo que te llevó.</Text>
      <Animated.View style={[styles.example, exampleStyle]}>
        <Text style={styles.label}>Por ejemplo</Text>
        <Text selectable style={styles.exampleText}>Hoy dediqué 2 horas a revisar una válvula en la línea de llenado.</Text>
      </Animated.View>
      <Text style={styles.hint}>Podés revisar los datos antes de guardar.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  title: { fontSize: 26, fontWeight: '600', color: colors.label, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.secondaryLabel, textAlign: 'center' },
  example: { width: '100%', maxWidth: 320, padding: spacing.md, gap: spacing.xs, marginTop: spacing.sm, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface },
  label: { fontSize: 12, color: colors.secondaryLabel, textAlign: 'center' },
  exampleText: { fontSize: 14, lineHeight: 20, color: colors.secondaryLabel, textAlign: 'center' },
  hint: { fontSize: 12, color: colors.tertiaryLabel, textAlign: 'center' },
});
