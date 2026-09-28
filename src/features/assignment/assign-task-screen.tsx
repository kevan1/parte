import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Stack } from 'expo-router';

import { listAssignableEmployees, assignTask } from '@/data/assignment-repository';
import { FormField } from '@/components/ui/form-field';
import { useAvailability } from '@/features/availability/availability-provider';
import { colors, radius, spacing } from '@/theme/tokens';
import type { AssignableEmployee, TaskRequesterType } from '@/domain/types';

type ScreenStatus = 'loading' | 'idle' | 'saving' | 'success' | 'error';

type DraftState = {
  projectName: string;
  taskDescription: string;
  requesterType: TaskRequesterType | null;
  requesterName: string;
  materialsInput: string;
};

const INITIAL_DRAFT: DraftState = {
  projectName: '',
  taskDescription: '',
  requesterType: null,
  requesterName: '',
  materialsInput: '',
};

const REQUESTER_TYPES: { label: string; value: TaskRequesterType }[] = [
  { label: 'Sector', value: 'sector' },
  { label: 'Línea', value: 'line' },
  { label: 'Persona', value: 'person' },
];

const parseMaterials = (input: string): string[] =>
  input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const AssignTaskScreen = () => {
  const availability = useAvailability();
  const [employees, setEmployees] = useState<AssignableEmployee[]>([]);
  const [selected, setSelected] = useState<AssignableEmployee | null>(null);
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noTokenWarning, setNoTokenWarning] = useState(false);
  const mounted = useRef(true);

  const isAdmin = availability.snapshot?.isAdmin === true;

  const load = useCallback(async () => {
    if (!isAdmin || !mounted.current) return;
    setStatus('loading');
    setErrorMessage(null);
    try {
      const rows = await listAssignableEmployees();
      if (mounted.current) {
        setEmployees(rows);
        setStatus('idle');
      }
    } catch {
      if (mounted.current) {
        setErrorMessage('No pudimos cargar los empleados.');
        setStatus('error');
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(load);
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const handleSelectEmployee = (employee: AssignableEmployee) => {
    setSelected(employee);
    setErrorMessage(null);
    setNoTokenWarning(false);
    setStatus('idle');
  };

  const handleSubmit = async () => {
    if (!selected || status === 'saving' || !isAdmin) return;
    if (!draft.projectName.trim() || !draft.taskDescription.trim()) return;

    setStatus('saving');
    setErrorMessage(null);
    setNoTokenWarning(false);

    try {
      const result = await assignTask({
        assigneeId: selected.id,
        projectName: draft.projectName,
        taskDescription: draft.taskDescription,
        requesterType: draft.requesterType,
        requesterName: draft.requesterName.trim() || null,
        materials: parseMaterials(draft.materialsInput),
      });

      if (!mounted.current) return;

      setStatus('success');
      setNoTokenWarning(result.tokenCount === 0);
      // Reset form for next assignment
      setSelected(null);
      setDraft(INITIAL_DRAFT);
    } catch {
      if (mounted.current) {
        setStatus('error');
        setErrorMessage(
          'No se pudo asignar la tarea. Revisá los datos y tus permisos, e intentá de nuevo.',
        );
      }
    }
  };

  const handleRetry = () => {
    setErrorMessage(null);
    setStatus('idle');
  };

  const isSaving = status === 'saving';

  // ── Non-admin ────────────────────────────────────────────────────────────────
  if (availability.loading) {
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <Stack.Screen options={{ title: 'Asignar tarea', headerBackTitle: 'Atrás' }} />
        <ActivityIndicator accessibilityLabel="Comprobando permisos" />
      </KeyboardAvoidingView>
    );
  }

  if (!isAdmin) {
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <Stack.Screen options={{ title: 'Asignar tarea', headerBackTitle: 'Atrás' }} />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Text style={styles.label}>Solo un administrador puede asignar tareas.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Loading employees ────────────────────────────────────────────────────────
  const isLoadingEmployees = status === 'loading';

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <Stack.Screen options={{ title: 'Asignar tarea', headerBackTitle: 'Atrás' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {/* ── Status messages ──────────────────────────────────────────────── */}
        {status === 'success' ? (
          <Text style={styles.success}>Tarea asignada correctamente.</Text>
        ) : null}
        {noTokenWarning ? (
          <Text accessibilityRole="alert" style={styles.warning}>
            La tarea fue asignada. El empleado no tiene notificaciones configuradas en ningún dispositivo.
          </Text>
        ) : null}
        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errorMessage}
          </Text>
        ) : null}
        {status === 'error' && !isLoadingEmployees ? (
          <Pressable
            accessibilityLabel="Reintentar"
            accessibilityRole="button"
            onPress={handleRetry}
            style={styles.row}
          >
            <Text style={styles.label}>Reintentar</Text>
          </Pressable>
        ) : null}

        {/* ── Employee picker ───────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Empleado</Text>
        {isLoadingEmployees ? (
          <ActivityIndicator accessibilityLabel="Cargando empleados" />
        ) : employees.length === 0 ? (
          <Text style={styles.detail}>No hay empleados disponibles.</Text>
        ) : selected ? (
          <View>
            <Pressable
              accessibilityLabel={selected.name}
              accessibilityRole="button"
              onPress={() => setSelected(null)}
              style={[styles.row, styles.selectedRow]}
            >
              <Text style={styles.label}>{selected.name}</Text>
              <Text style={styles.detail}>{selected.email}</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text style={styles.detail}>Seleccioná un empleado</Text>
            {employees.map((employee) => (
              <Pressable
                key={employee.id}
                accessibilityLabel={employee.name}
                accessibilityRole="button"
                onPress={() => handleSelectEmployee(employee)}
                style={styles.row}
              >
                <Text style={styles.label}>{employee.name}</Text>
                <Text style={styles.detail}>{employee.email}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Task fields ───────────────────────────────────────────────────── */}
        <FormField
          accessibilityLabel="Proyecto"
          label="Proyecto"
          value={draft.projectName}
          editable={!isSaving}
          onChangeText={(projectName) => setDraft({ ...draft, projectName })}
          maxLength={120}
        />
        <FormField
          accessibilityLabel="Descripción de la tarea"
          label="Descripción de la tarea"
          value={draft.taskDescription}
          editable={!isSaving}
          onChangeText={(taskDescription) => setDraft({ ...draft, taskDescription })}
          maxLength={500}
          multiline
        />

        {/* ── Optional requester ────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Solicitado por (tipo)</Text>
        <View style={styles.typeRow}>
          <Pressable
            accessibilityLabel="Sin tipo"
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.requesterType === null }}
            onPress={() => setDraft({ ...draft, requesterType: null })}
            style={[styles.typeChip, draft.requesterType === null && styles.typeChipSelected]}
          >
            <Text style={styles.label}>–</Text>
          </Pressable>
          {REQUESTER_TYPES.map(({ label, value }) => (
            <Pressable
              key={value}
              accessibilityLabel={label}
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.requesterType === value }}
              onPress={() => setDraft({ ...draft, requesterType: value })}
              style={[styles.typeChip, draft.requesterType === value && styles.typeChipSelected]}
            >
              <Text style={styles.label}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <FormField
          accessibilityLabel="Nombre del solicitante"
          label="Nombre del solicitante"
          value={draft.requesterName}
          editable={!isSaving}
          onChangeText={(requesterName) => setDraft({ ...draft, requesterName })}
          maxLength={160}
        />

        <FormField
          accessibilityLabel="Materiales (separados por coma)"
          label="Materiales (separados por coma)"
          value={draft.materialsInput}
          editable={!isSaving}
          onChangeText={(materialsInput) => setDraft({ ...draft, materialsInput })}
        />

        {/* ── Submit ────────────────────────────────────────────────────────── */}
        <Pressable
          accessibilityLabel="Asignar tarea"
          accessibilityRole="button"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={() => void handleSubmit()}
          style={styles.row}
        >
          {isSaving ? (
            <ActivityIndicator accessibilityLabel="Asignando tarea" />
          ) : (
            <Text style={styles.label}>Asignar tarea</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.secondaryLabel, textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 16, color: colors.label },
  detail: { fontSize: 14, lineHeight: 20, color: colors.secondaryLabel },
  success: { fontSize: 15, color: colors.label },
  warning: { fontSize: 14, lineHeight: 20, color: colors.warning },
  error: { color: colors.destructive, fontSize: 15 },
  row: {
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    gap: 4,
  },
  selectedRow: {
    borderWidth: 1,
    borderColor: colors.label,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeChip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeChipSelected: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.label,
  },
});
