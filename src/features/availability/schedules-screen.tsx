import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Stack } from 'expo-router';
import { listEmployeeSchedules, saveEmployeeSchedule, type WorkSchedule } from '@/data/availability-repository';
import { FormField } from '@/components/ui/form-field';
import { useAvailability } from './availability-provider';
import { colors } from '@/theme/tokens';

type Employee = Awaited<ReturnType<typeof listEmployeeSchedules>>[number];
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export function SchedulesScreen() {
  const availability = useAvailability();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<WorkSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => locked.current);
    return () => listener.remove();
  }, []);
  const isAdmin = availability.snapshot?.isAdmin === true;
  const load = useCallback(async () => {
    if (!isAdmin || !mounted.current) return;
    setLoading(true);
    setError(null);
    try { const rows = await listEmployeeSchedules(); if (mounted.current) setEmployees(rows); }
    catch { if (mounted.current) setError('No pudimos cargar las jornadas.'); }
    finally { if (mounted.current) setLoading(false); }
  }, [isAdmin]);
  useEffect(() => { mounted.current = true; void Promise.resolve().then(load); return () => { mounted.current = false; }; }, [load]);
  const edit = (employee: Employee) => {
    setSelected(employee);
    setError(null);
    setDraft(employee.schedule ?? { userId: employee.id, weekdays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00', timeZone: 'America/Argentina/Buenos_Aires' });
  };
  const save = async () => {
    if (!draft || locked.current || !isAdmin) return;
    if (!draft.weekdays.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime) || draft.startTime >= draft.endTime) {
      setError('Elegí al menos un día y un horario válido: inicio anterior al fin, en formato HH:mm.'); return;
    }
    try { new Intl.DateTimeFormat('es-AR', { timeZone: draft.timeZone }).format(); }
    catch { setError('Ingresá una zona horaria válida, por ejemplo America/Argentina/Buenos_Aires.'); return; }
    locked.current = true;
    setSaving(true); setError(null);
    try {
      await saveEmployeeSchedule(draft);
      if (!mounted.current) return;
      setEmployees((rows) => rows.map((row) => row.id === draft.userId ? { ...row, schedule: draft } : row));
      setSelected(null); setDraft(null);
      await availability.refresh();
    } catch { if (mounted.current) setError('No pudimos guardar la jornada. Revisá los datos y tus permisos, e intentá de nuevo.'); }
    finally { locked.current = false; if (mounted.current) setSaving(false); }
  };
  return <KeyboardAvoidingView behavior="padding" style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <Stack.Screen options={{ title: 'Jornadas', headerBackTitle: 'Atrás', gestureEnabled: !saving, headerBackVisible: !saving }} />
    {availability.loading ? <ActivityIndicator accessibilityLabel="Comprobando permisos" /> : !isAdmin ? <>
      <Text style={styles.label}>{availability.error ?? 'Solo un administrador puede configurar las jornadas.'}</Text>
      {availability.error ? <Pressable accessibilityRole="button" onPress={() => void availability.refresh()} style={styles.row}><Text style={styles.label}>Reintentar</Text></Pressable> : null}
    </> : selected && draft ? <>
      <Text style={styles.title}>{selected.email}</Text>
      <Text style={styles.detail}>Jornada habitual. Los cambios se aplican al guardar.</Text>
      <Text style={styles.label}>Días laborables</Text>
      <View style={styles.days}>{DAYS.map((day, index) => {
        const checked = draft.weekdays.includes(index + 1);
        return <Pressable key={day} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: saving }} disabled={saving} onPress={() => setDraft({ ...draft, weekdays: checked ? draft.weekdays.filter((value) => value !== index + 1) : [...draft.weekdays, index + 1].sort() })} style={[styles.day, checked && styles.chosen]}><Text style={styles.label}>{checked ? '✓ ' : ''}{day}</Text></Pressable>;
      })}</View>
      <FormField label="Inicio (HH:mm)" value={draft.startTime} editable={!saving} onChangeText={(startTime) => setDraft({ ...draft, startTime })} keyboardType="numbers-and-punctuation" maxLength={5} />
      <FormField label="Fin (HH:mm)" value={draft.endTime} editable={!saving} onChangeText={(endTime) => setDraft({ ...draft, endTime })} keyboardType="numbers-and-punctuation" maxLength={5} />
      <FormField label="Zona horaria" value={draft.timeZone} editable={!saving} onChangeText={(timeZone) => setDraft({ ...draft, timeZone: timeZone.trim() })} autoCapitalize="none" autoCorrect={false} />
      <Text style={styles.detail}>Un intervalo por día. Sin turnos que crucen medianoche.</Text>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.row}>{saving ? <ActivityIndicator accessibilityLabel="Guardando jornada" /> : <Text style={styles.label}>Guardar jornada</Text>}</Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setSelected(null); setDraft(null); setError(null); }} style={styles.row}><Text style={styles.label}>Volver a empleados</Text></Pressable>
    </> : <>
      <Text style={styles.detail}>Seleccioná un empleado para configurar su jornada.</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Cargando empleados" /> : employees.map((employee) => <Pressable key={employee.id} accessibilityRole="button" onPress={() => edit(employee)} style={styles.row}><View style={styles.copy}><Text style={styles.label}>{employee.email}</Text><Text style={styles.detail}>{employee.schedule ? `${employee.schedule.startTime}–${employee.schedule.endTime} · ${employee.schedule.timeZone}` : 'Jornada sin configurar'}</Text></View></Pressable>)}
      {!loading && !employees.length && !error ? <Text style={styles.detail}>No hay empleados para mostrar.</Text> : null}
      {error && !loading ? <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.row}><Text style={styles.label}>Reintentar</Text></Pressable> : null}
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingBottom: 48, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', color: colors.label }, label: { fontSize: 16, color: colors.label }, detail: { fontSize: 14, lineHeight: 20, color: colors.secondaryLabel },
  row: { minHeight: 48, padding: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface, justifyContent: 'center' },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, day: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: colors.separator, borderRadius: 12 }, chosen: { backgroundColor: colors.accentSurface, borderColor: colors.label },
  copy: { gap: 4 }, error: { color: colors.destructive, fontSize: 15 },
});
