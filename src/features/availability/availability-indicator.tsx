import { Platform, PlatformColor, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAvailability } from './availability-provider';
import { colors } from '@/theme/tokens';

export function statusColor(kind: string) {
  if (kind === 'available') return Platform.OS === 'ios' ? PlatformColor('systemGreen') : '#248A3D';
  if (kind === 'remote') return colors.warning;
  if (kind === 'absent' || kind === 'off-hours') return colors.destructive;
  return colors.tertiaryLabel;
}
const headerLabels: Record<string, string> = { available: 'Disponible', remote: 'Remoto', absent: 'Ausente', 'off-hours': 'Fuera de horario', unconfigured: 'Sin jornada', loading: 'Cargando', offline: 'Sin conexión', unavailable: 'No disponible', error: 'No disponible' };

export function AvailabilityIndicator({ onPress, variant = 'default' }: { onPress?: () => void; variant?: 'default' | 'header' }) {
  const { kind, label, manual } = useAvailability();
  const isHeader = variant === 'header';
  const description = `${isHeader ? headerLabels[kind] ?? label : label}${manual ? ' · Manual' : ''}`;
  const content = <><View style={[styles.dot, { backgroundColor: statusColor(kind) }]} /><Text numberOfLines={isHeader ? 1 : undefined} style={styles.text}>{description}</Text></>;
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Tu disponibilidad: ${description}`} style={[styles.row, isHeader && styles.header]}>{content}</Pressable>
    : <View accessible accessibilityLabel={description} style={styles.row}>{content}</View>;
}
const styles = StyleSheet.create({
  row: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  header: { paddingHorizontal: 12, maxWidth: 170, borderRadius: 22, borderCurve: 'continuous', backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { color: colors.label, fontSize: 13, flexShrink: 1 },
});
