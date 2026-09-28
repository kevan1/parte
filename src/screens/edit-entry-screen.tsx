import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { getTimeEntry, listWorkStreams, updateTimeEntry } from '@/data/time-entry-repository';
import type { TimeEntry, WorkStream } from '@/domain/types';
import {
  applyDurationEdit,
  decimalHoursToMinutes,
  formatDecimalHours,
} from '@/domain/time-normalization';
import { FormField } from '@/components/ui/form-field';
import { PrimaryButton } from '@/components/ui/primary-button';
import { EvidenceGallery } from '@/components/time-entry/evidence-gallery';
import { historyStore } from '@/state/history';
import { colors, spacing } from '@/theme/tokens';

export function EditEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [hoursText, setHoursText] = useState('');
  const [workStreams, setWorkStreams] = useState<WorkStream[]>([]);
  const [selectedWorkStreamId, setSelectedWorkStreamId] = useState<string | null>(null);
  const [createNewStream, setCreateNewStream] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void Promise.all([getTimeEntry(id), listWorkStreams()])
      .then(([value, streams]) => {
        setEntry(value);
        setWorkStreams(streams);
        setSelectedWorkStreamId(value.workStreamId);
        setHoursText(formatDecimalHours(value.durationMinutes));
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
        setErrorMessage('No pudimos cargar la entrada.');
      });
  }, [id]);

  if (status === 'loading') {
    return (
      <View accessible accessibilityLabel="Cargando entrada" style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={{ padding: spacing.md }}>
        <Text accessibilityRole="alert" selectable style={{ color: colors.destructive }}>
          {errorMessage}
        </Text>
      </View>
    );
  }

  const save = async () => {
    try {
      const durationMinutes = decimalHoursToMinutes(hoursText);
      const timePatch =
        durationMinutes === entry.durationMinutes
          ? { durationMinutes, startTime: entry.startTime, endTime: entry.endTime }
          : applyDurationEdit(entry, hoursText);
      setStatus('saving');
      setErrorMessage(null);
      await updateTimeEntry(
        { ...entry, ...timePatch },
        { workStreamId: selectedWorkStreamId, createNewStream },
      );
      historyStore.getState().markStale();
      router.back();
    } catch {
      setStatus('ready');
      setErrorMessage('Revisá los datos. No pudimos actualizar la entrada.');
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
    >
      <FormField
        label="Proyecto"
        required
        value={entry.projectName}
        maxLength={120}
        onChangeText={(projectName) => setEntry({ ...entry, projectName })}
      />
      <View style={{ gap: spacing.sm }}>
        <Text selectable style={{ color: colors.label, fontWeight: '600' }}>
          Continuidad
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: createNewStream }}
          onPress={() => {
            setCreateNewStream(true);
            setSelectedWorkStreamId(null);
          }}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: createNewStream ? colors.accent : colors.secondaryLabel }}>
            {createNewStream ? '✓ ' : ''}Crear un hilo de trabajo nuevo
          </Text>
        </Pressable>
        {workStreams.map((stream) => {
          const selected = !createNewStream && selectedWorkStreamId === stream.id;
          return (
            <Pressable
              key={stream.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Continuar ${stream.taskDescription} de ${stream.projectName}`}
              onPress={() => {
                setCreateNewStream(false);
                setSelectedWorkStreamId(stream.id);
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: selected ? colors.accent : colors.secondaryLabel }}>
                {selected ? '✓ ' : ''}{stream.projectName} · {stream.taskDescription}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FormField
        label="Tarea"
        required
        value={entry.taskDescription}
        maxLength={500}
        onChangeText={(taskDescription) => setEntry({ ...entry, taskDescription })}
      />
      <FormField
        label="Fecha"
        required
        value={entry.workDate}
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        onChangeText={(workDate) => setEntry({ ...entry, workDate })}
      />
      <FormField
        label="Horas"
        required
        value={hoursText}
        keyboardType="decimal-pad"
        onChangeText={setHoursText}
      />
      <FormField
        label="Notas"
        multiline
        value={entry.notes ?? ''}
        maxLength={2_000}
        onChangeText={(notes) => setEntry({ ...entry, notes: notes || null })}
      />
      <EvidenceGallery workStreamId={entry.workStreamId} />
      {errorMessage ? (
        <Text accessibilityRole="alert" selectable style={{ color: colors.destructive }}>
          {errorMessage}
        </Text>
      ) : null}
      <PrimaryButton label="Guardar cambios" loading={status === 'saving'} onPress={() => void save()} />
      <Text selectable style={{ color: colors.tertiaryLabel, textAlign: 'center', fontSize: 13 }}>
        Las entradas se pueden corregir, pero no eliminar.
      </Text>
    </ScrollView>
  );
}
