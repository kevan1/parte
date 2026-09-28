import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FormField } from '@/components/ui/form-field';
import { PrimaryButton } from '@/components/ui/primary-button';
import {
  confirmTimeEntries,
  getDayMinutes,
  listWorkStreams,
} from '@/data/time-entry-repository';
import {
  buildManualEntryDraft,
  DURATION_HOURS,
  DURATION_MINUTES,
  type ManualEntryErrors,
  type ManualEntryFields,
  validateManualEntry,
} from '@/domain/manual-entry';
import type { EditableTimeEntryDraft, TaskRequesterType, TimeEntry, WorkStream } from '@/domain/types';
import { todayInTimeZone } from '@/domain/week-summary';
import { colors, radius, spacing } from '@/theme/tokens';

type RecentWorkStatus = 'loading' | 'empty' | 'error' | 'success';

const requesterOptions: { type: TaskRequesterType; label: string }[] = [
  { type: 'sector', label: 'Sector' },
  { type: 'line', label: 'Línea' },
  { type: 'person', label: 'Persona' },
];

export type ManualEntryScreenProps = {
  today?: string;
  createId?: () => string;
  loadWorkStreams?: () => Promise<WorkStream[]>;
  loadDayMinutes?: (workDate: string) => Promise<number>;
  confirmEntries?: (
    submissionId: string,
    drafts: EditableTimeEntryDraft[],
  ) => Promise<TimeEntry[]>;
  onCancel?: () => void;
  onSavingChange?: (saving: boolean) => void;
  onSaved: () => void;
};

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function isoFromLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ManualEntryScreen({
  today = todayInTimeZone(),
  createId = Crypto.randomUUID,
  loadWorkStreams = listWorkStreams,
  loadDayMinutes = getDayMinutes,
  confirmEntries = confirmTimeEntries,
  onCancel,
  onSavingChange,
  onSaved,
}: ManualEntryScreenProps) {
  const isIos = process.env.EXPO_OS === 'ios';
  const [fields, setFields] = useState<ManualEntryFields>({
    workDate: today,
    hours: 1,
    minutes: 0,
    projectName: '',
    taskDescription: '',
    notes: '',
    selectedWorkStreamId: null,
    requesterType: null,
    requesterName: '',
    materialsInput: '',
  });
  const [errors, setErrors] = useState<ManualEntryErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [workStreams, setWorkStreams] = useState<WorkStream[]>([]);
  const [recentStatus, setRecentStatus] = useState<RecentWorkStatus>('loading');
  const [saving, setSaving] = useState(false);
  const [retryLocked, setRetryLocked] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const loadGeneration = useRef(0);
  const mounted = useRef(true);
  const submissionId = useRef<string | null>(null);
  const clientId = useRef<string | null>(null);
  const frozenDraft = useRef<EditableTimeEntryDraft | null>(null);
  const saveInFlight = useRef(false);

  useEffect(() => {
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
    };
  }, []);

  const loadRecentWork = useCallback(async () => {
    const requestGeneration = ++loadGeneration.current;
    setRecentStatus('loading');
    try {
      const streams = await loadWorkStreams();
      if (!mounted.current || requestGeneration !== loadGeneration.current) return;
      setWorkStreams(streams);
      setRecentStatus(streams.length > 0 ? 'success' : 'empty');
    } catch {
      if (!mounted.current || requestGeneration !== loadGeneration.current) return;
      setRecentStatus('error');
    }
  }, [loadWorkStreams]);

  useEffect(() => {
    void Promise.resolve().then(loadRecentWork);
  }, [loadRecentWork]);

  const formLocked = saving || retryLocked;
  const metadataLocked = Boolean(fields.selectedWorkStreamId);
  const updateManualField = <Key extends keyof ManualEntryFields>(
    key: Key,
    value: ManualEntryFields[Key],
  ) => {
    setFields((current) => ({
      ...current,
      [key]: value,
      ...((key === 'projectName' || key === 'taskDescription') && current.selectedWorkStreamId
        ? {
            selectedWorkStreamId: null,
            requesterType: null,
            requesterName: '',
            materialsInput: '',
          }
        : {}),
    }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setGeneralError(null);
  };

  const selectWorkStream = (stream: WorkStream) => {
    if (formLocked) return;
    setFields((current) => ({
      ...current,
      projectName: stream.projectName,
      taskDescription: stream.taskDescription,
      selectedWorkStreamId: stream.id,
      requesterType: stream.requesterType ?? null,
      requesterName: stream.requesterName ?? '',
      materialsInput: stream.materials?.join(', ') ?? '',
    }));
    setErrors((current) => ({ ...current, projectName: undefined, taskDescription: undefined }));
    setGeneralError(null);
    Keyboard.dismiss();
  };

  const save = async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    Keyboard.dismiss();
    setGeneralError(null);

    if (!frozenDraft.current) {
      const fieldErrors = validateManualEntry(fields, { today, existingDayMinutes: 0 });
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        saveInFlight.current = false;
        return;
      }
    }

    setSaving(true);
    onSavingChange?.(true);
    let releasedSavingState = false;
    try {
      let draft = frozenDraft.current;
      if (!draft) {
        const existingDayMinutes = await loadDayMinutes(fields.workDate);
        if (!mounted.current) return;
        const completeErrors = validateManualEntry(fields, { today, existingDayMinutes });
        if (Object.keys(completeErrors).length > 0) {
          setErrors(completeErrors);
          return;
        }

        submissionId.current ??= createId();
        clientId.current ??= createId();
        draft = buildManualEntryDraft(fields, clientId.current, existingDayMinutes);
        frozenDraft.current = draft;
      }

      await confirmEntries(submissionId.current!, [draft]);
      if (!mounted.current) return;
      saveInFlight.current = false;
      setSaving(false);
      onSavingChange?.(false);
      releasedSavingState = true;
      onSaved();
    } catch {
      if (!mounted.current) return;
      if (submissionId.current) {
        setRetryLocked(true);
        setGeneralError('No pudimos guardar el registro. Intentá nuevamente.');
      } else {
        setGeneralError('No pudimos validar el total del día. Revisá la conexión.');
      }
    } finally {
      saveInFlight.current = false;
      if (mounted.current && !releasedSavingState) {
        setSaving(false);
        onSavingChange?.(false);
      }
    }
  };

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, isIos && { paddingTop: spacing.sm, gap: spacing.xs }]}
      testID="manual-entry-scroll"
    >
      {!isIos ? (
        <View style={styles.sheetHeader}>
          <View style={styles.headerCopy}>
            <Text selectable style={styles.title}>
              Nueva carga
            </Text>
            <Text selectable style={styles.subtitle}>
              Registrá una actividad sin usar la interpretación por texto.
            </Text>
          </View>
          {onCancel ? (
            <Pressable
              accessibilityLabel="Cancelar carga manual"
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>Cancelar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          Duración
        </Text>
        <View style={styles.durationRow}>
          <View style={styles.pickerColumn}>
            <Text selectable style={styles.pickerLabel}>
              Horas
            </Text>
            <Picker
              accessibilityLabel="Horas de duración"
              enabled={!formLocked}
              selectedValue={fields.hours}
              onValueChange={(hours) => {
                setFields((current) => ({ ...current, hours: Number(hours) }));
                setErrors((current) => ({ ...current, duration: undefined }));
              }}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {DURATION_HOURS.map((hours) => (
                <Picker.Item key={hours} label={String(hours)} value={hours} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Text selectable style={styles.pickerLabel}>
              Minutos
            </Text>
            <Picker
              accessibilityLabel="Minutos de duración"
              enabled={!formLocked}
              selectedValue={fields.minutes}
              onValueChange={(minutes) => {
                setFields((current) => ({ ...current, minutes: Number(minutes) }));
                setErrors((current) => ({ ...current, duration: undefined }));
              }}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {DURATION_MINUTES.map((minutes) => (
                <Picker.Item key={minutes} label={String(minutes).padStart(2, '0')} value={minutes} />
              ))}
            </Picker>
          </View>
        </View>
        {errors.duration ? (
          <Text accessibilityRole="alert" selectable style={styles.errorText}>
            {errors.duration}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          Fecha
        </Text>
        <View style={styles.dateRow}>
          <Text selectable style={styles.dateLabel}>
            Día trabajado
          </Text>
          {isIos ? (
            <DateTimePicker
              accessibilityLabel="Fecha trabajada"
              disabled={formLocked}
              display="compact"
              maximumDate={dateFromIso(today)}
              mode="date"
              value={dateFromIso(fields.workDate)}
              onValueChange={(_event, value) => {
                if (!mounted.current || !value) return;
                const nextDate = isoFromLocalDate(value);
                if (nextDate === fields.workDate) return;
                updateManualField('workDate', nextDate);
              }}
            />
          ) : (
            <>
              <Pressable
                accessibilityLabel="Abrir selector de fecha"
                accessibilityRole="button"
                accessibilityState={{ disabled: formLocked }}
                disabled={formLocked}
                onPress={() => setShowDatePicker(true)}
                style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}
              >
                <Text selectable style={styles.dateButtonText}>
                  {fields.workDate}
                </Text>
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  accessibilityLabel="Fecha trabajada"
                  display="calendar"
                  maximumDate={dateFromIso(today)}
                  mode="date"
                  value={dateFromIso(fields.workDate)}
                  onValueChange={(_event, value) => {
                    if (!mounted.current || !value) return;
                    const nextDate = isoFromLocalDate(value);
                    setShowDatePicker(false);
                    if (nextDate === fields.workDate) return;
                    updateManualField('workDate', nextDate);
                  }}
                  onDismiss={() => {
                    setShowDatePicker(false);
                  }}
                />
              ) : null}
            </>
          )}
        </View>
        {errors.workDate ? (
          <Text accessibilityRole="alert" selectable style={styles.errorText}>
            {errors.workDate}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          Tareas recientes
        </Text>
        {recentStatus === 'loading' ? (
          <View accessible accessibilityLabel="Cargando tareas recientes" style={styles.stateRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.secondaryText}>Cargando…</Text>
          </View>
        ) : null}
        {recentStatus === 'empty' ? (
          <Text selectable style={styles.secondaryText}>
            Todavía no hay tareas recientes.
          </Text>
        ) : null}
        {recentStatus === 'error' ? (
          <View style={styles.stateColumn}>
            <Text accessibilityRole="alert" selectable style={styles.errorText}>
              No pudimos cargar tus tareas recientes. Podés completar los campos manualmente.
            </Text>
            <PrimaryButton
              accessibilityLabel="Reintentar tareas recientes"
              label="Reintentar"
              variant="soft"
              onPress={() => void loadRecentWork()}
            />
          </View>
        ) : null}
        {recentStatus === 'success' ? (
          <View style={styles.streamList}>
            {workStreams.map((stream) => {
              const selected = fields.selectedWorkStreamId === stream.id;
              return (
                <Pressable
                  key={stream.id}
                  accessibilityLabel={`Usar ${stream.taskDescription} de ${stream.projectName}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={formLocked}
                  onPress={() => selectWorkStream(stream)}
                  style={({ pressed }) => [
                    styles.streamButton,
                    selected && styles.streamButtonSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.streamProject}>
                    {stream.projectName}
                  </Text>
                  <Text numberOfLines={2} style={styles.streamTask}>
                    {stream.taskDescription}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.formSection}>
        <FormField
          editable={!formLocked}
          error={errors.projectName}
          label="Proyecto"
          maxLength={120}
          required
          returnKeyType="next"
          value={fields.projectName}
          onChangeText={(value) => updateManualField('projectName', value)}
        />
        <FormField
          editable={!formLocked}
          error={errors.taskDescription}
          label="Tarea"
          maxLength={500}
          required
          returnKeyType="next"
          value={fields.taskDescription}
          onChangeText={(value) => updateManualField('taskDescription', value)}
        />
        <View style={styles.metadataSection}>
          <View style={styles.metadataHeading}>
            <Text selectable style={styles.metadataTitle}>
              Detalles del trabajo
            </Text>
            <Text selectable style={styles.optionalLabel}>
              Opcional
            </Text>
          </View>
          <Text selectable style={styles.metadataHint}>
            Indicá quién pidió el trabajo y qué materiales se usaron, si corresponde.
          </Text>
          <View accessibilityRole="radiogroup" style={styles.requesterOptions}>
            {requesterOptions.map((option) => {
              const selected = fields.requesterType === option.type;
              return (
                <Pressable
                  key={option.type}
                  accessibilityLabel={option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ disabled: formLocked || metadataLocked, selected }}
                  disabled={formLocked || metadataLocked}
                  onPress={() => updateManualField('requesterType', option.type)}
                  style={({ pressed }) => [
                    styles.requesterOption,
                    selected && styles.requesterOptionSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.requesterOptionText, selected && styles.requesterOptionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.requesterType ? (
            <Text accessibilityRole="alert" selectable style={styles.errorText}>
              {errors.requesterType}
            </Text>
          ) : null}
          <FormField
            editable={!formLocked && !metadataLocked}
            error={errors.requesterName}
            label="Quién pidió el trabajo"
            maxLength={160}
            value={fields.requesterName}
            onChangeText={(value) => updateManualField('requesterName', value)}
          />
          <FormField
            editable={!formLocked && !metadataLocked}
            error={errors.materials}
            label="Materiales utilizados (opcional)"
            maxLength={2_000}
            placeholder="Ej.: tornillos, cable 4 mm"
            value={fields.materialsInput}
            onChangeText={(value) => updateManualField('materialsInput', value)}
          />
          {metadataLocked ? (
            <Text selectable style={styles.metadataHint}>
              Estos datos pertenecen a la tarea seleccionada.
            </Text>
          ) : null}
        </View>
        <FormField
          editable={!formLocked}
          error={errors.notes}
          label="Notas"
          maxLength={2_000}
          multiline
          value={fields.notes}
          onChangeText={(value) => updateManualField('notes', value)}
        />
      </View>

      {retryLocked ? (
        <Text selectable style={styles.retryHint}>
          Conservamos los datos del intento anterior para evitar una carga duplicada.
        </Text>
      ) : null}
      {generalError ? (
        <Text accessibilityRole="alert" selectable style={styles.errorText}>
          {generalError}
        </Text>
      ) : null}
      <PrimaryButton
        label="Guardar registro"
        loading={saving}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.label,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  cancelButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  cancelLabel: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.surface,
    borderCurve: 'continuous',
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerLabel: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  picker: {
    color: colors.label,
    height: 140,
  },
  pickerItem: {
    color: colors.label,
    fontSize: 21,
    height: 140,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  dateLabel: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 15,
  },
  dateButton: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderCurve: 'continuous',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  dateButtonText: {
    color: colors.label,
    fontSize: 15,
  },
  stateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
  },
  stateColumn: {
    gap: spacing.sm,
  },
  secondaryText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  streamList: {
    gap: spacing.sm,
  },
  streamButton: {
    borderColor: colors.separator,
    borderCurve: 'continuous',
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  streamButtonSelected: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accent,
  },
  streamProject: {
    color: colors.label,
    fontSize: 15,
    fontWeight: '700',
  },
  streamTask: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  formSection: {
    gap: spacing.md,
  },
  metadataSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  metadataHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metadataTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
  },
  optionalLabel: {
    color: colors.tertiaryLabel,
    fontSize: 13,
  },
  metadataHint: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  requesterOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  requesterOption: {
    flex: 1,
    alignItems: 'center',
    borderColor: colors.separator,
    borderCurve: 'continuous',
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  requesterOptionSelected: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accent,
  },
  requesterOptionText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    fontWeight: '600',
  },
  requesterOptionTextSelected: {
    color: colors.accent,
  },
  errorText: {
    color: colors.destructive,
    fontSize: 13,
    lineHeight: 18,
  },
  retryHint: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.66,
  },
});
