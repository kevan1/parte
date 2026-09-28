import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAvailability } from './availability-provider';
import { AvailabilityIndicator, statusColor } from './availability-indicator';
import { formatTodaySchedule } from '@/domain/availability';
import { colors } from '@/theme/tokens';

export function AvailabilityScreen() {
  const state = useAvailability();
  const router = useRouter();
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => locked.current);
    return () => listener.remove();
  }, []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const select = async (mode: 'available' | 'remote' | 'absent' | 'automatic') => {
    if (locked.current) return;
    locked.current = true;
    setError(null);
    try {
      await state.change(mode);
      if (mounted.current) router.back();
    } catch {
      if (mounted.current) setError('No pudimos guardar el estado. Intentá de nuevo.');
    } finally { locked.current = false; }
  };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={styles.screen}>
    <Stack.Screen options={{ title: 'Tu disponibilidad', gestureEnabled: !state.saving, headerBackVisible: !state.saving }} />
    <AvailabilityIndicator />
    <Text style={styles.detail}>{formatTodaySchedule(state.snapshot?.schedule ?? null, state.now)}</Text>
    {state.loading ? <ActivityIndicator accessibilityLabel="Cargando disponibilidad" /> : state.error ? <><Text accessibilityRole="alert" style={styles.error}>{state.error}</Text><Pressable accessibilityRole="button" onPress={() => void state.refresh()} style={styles.row}><Text style={styles.label}>Reintentar</Text></Pressable></> : <>
      {(['available', 'remote', 'absent'] as const).map((mode) => {
        const disabled = state.saving || (mode !== 'available' && !state.snapshot?.schedule);
        const selected = state.snapshot?.override?.mode === mode && (mode === 'available' || state.kind === mode);
        return <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => void select(mode)} style={[styles.row, disabled && styles.disabled]}>
          <View style={[styles.dot, { backgroundColor: statusColor(mode) }]} />
          <View style={styles.copy}><Text style={styles.label}>{mode === 'available' ? 'Disponible' : mode === 'remote' ? 'Remoto' : 'Ausente'}</Text><Text style={styles.detail}>{mode === 'available' ? 'Se mantendrá hasta que lo cambies' : 'Solo hoy, durante tu jornada'}</Text></View>
          {selected ? <Text style={styles.label} accessibilityLabel="Seleccionado">✓</Text> : null}
        </Pressable>;
      })}
      {!state.snapshot?.schedule ? <Text style={styles.detail}>Pedile a un administrador que configure tu jornada.</Text> : null}
      <Pressable accessibilityRole="button" disabled={state.saving} onPress={() => void select('automatic')} style={styles.row}><Text style={styles.label}>Volver al horario automático</Text></Pressable>
    </>}
    {state.saving ? <ActivityIndicator accessibilityLabel="Guardando disponibilidad" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Text style={styles.detail}>Cambiar tu disponibilidad no registra horas trabajadas.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingBottom: 48, gap: 16 },
  row: { minHeight: 56, padding: 16, backgroundColor: colors.surface, borderRadius: 16, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 4 }, label: { fontSize: 17, color: colors.label, flexShrink: 1 }, detail: { fontSize: 14, lineHeight: 20, color: colors.secondaryLabel },
  dot: { width: 12, height: 12, borderRadius: 6 }, disabled: { opacity: 0.45 }, error: { fontSize: 15, color: colors.destructive },
});
