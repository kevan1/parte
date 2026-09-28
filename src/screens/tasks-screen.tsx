import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listWorkStreams } from '@/data/time-entry-repository';
import { EvidenceGallery } from '@/components/time-entry/evidence-gallery';
import type { TaskRequesterType, WorkStream } from '@/domain/types';
import { colors, radius, spacing } from '@/theme/tokens';

type TasksStatus = 'loading' | 'success' | 'empty' | 'error';

const requesterLabels: Record<TaskRequesterType, string> = {
  sector: 'Sector',
  line: 'Línea de producción',
  person: 'Persona',
};

function TaskCard({ task }: { task: WorkStream }) {
  const hasRequester = Boolean(task.requesterType && task.requesterName);
  const materials = task.materials?.filter(Boolean) ?? [];

  return (
    <View testID={`assigned-task-${task.id}`} style={styles.card}>
      <View style={styles.cardHeading}>
        <Text selectable numberOfLines={1} style={styles.project}>
          {task.projectName}
        </Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>Abierta</Text>
        </View>
      </View>
      <Text selectable style={styles.taskDescription}>
        {task.taskDescription}
      </Text>

      {hasRequester ? (
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>
            Solicitado por · {requesterLabels[task.requesterType!]}
          </Text>
          <Text selectable style={styles.detailValue}>
            {task.requesterName}
          </Text>
        </View>
      ) : null}

      {materials.length > 0 ? (
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>Materiales</Text>
          <Text selectable style={styles.detailValue}>
            {materials.join(' · ')}
          </Text>
        </View>
      ) : null}

      <EvidenceGallery workStreamId={task.id} />
    </View>
  );
}

export function TasksScreen() {
  const [tasks, setTasks] = useState<WorkStream[]>([]);
  const [status, setStatus] = useState<TasksStatus>('loading');
  const requestGeneration = useRef(0);
  const mounted = useRef(true);

  const loadTasks = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setStatus('loading');
    try {
      const nextTasks = await listWorkStreams();
      if (!mounted.current || generation !== requestGeneration.current) return;
      setTasks(nextTasks.filter((task) => task.status === 'open'));
      setStatus(nextTasks.some((task) => task.status === 'open') ? 'success' : 'empty');
    } catch {
      if (!mounted.current || generation !== requestGeneration.current) return;
      setTasks([]);
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      void loadTasks();
      return () => {
        mounted.current = false;
        requestGeneration.current += 1;
      };
    }, [loadTasks]),
  );

  return (
    <ScrollView
      testID="tasks-scroll"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={status === 'loading' && tasks.length > 0}
          onRefresh={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void loadTasks();
          }}
        />
      }
      contentContainerStyle={styles.content}
    >
      <View style={styles.intro}>
        <Text selectable style={styles.title}>Tareas asignadas</Text>
        <Text selectable style={styles.subtitle}>
          Revisá el trabajo pendiente y usalo como referencia al cargar tus horas.
        </Text>
      </View>

      {status === 'loading' && tasks.length === 0 ? (
        <View accessibilityLabel="Cargando tareas" style={styles.state}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateText}>Cargando tareas…</Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View style={styles.state}>
          <Text accessibilityRole="alert" selectable style={styles.errorText}>
            No pudimos cargar tus tareas.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadTasks()}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'empty' ? (
        <View style={styles.emptyState}>
          <Text selectable style={styles.emptyTitle}>No tenés tareas asignadas</Text>
          <Text selectable style={styles.emptyText}>
            Cuando te asignen un trabajo, va a aparecer acá con su solicitante y los materiales necesarios.
          </Text>
        </View>
      ) : null}

      {status === 'success' ? (
        <View style={styles.taskList}>
          {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing.md,
    gap: spacing.lg,
  },
  intro: {
    gap: spacing.xs,
  },
  title: {
    color: colors.label,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
  },
  taskList: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  project: {
    flex: 1,
    color: colors.label,
    fontSize: 17,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentSurface,
  },
  statusText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  taskDescription: {
    color: colors.secondaryLabel,
    fontSize: 16,
    lineHeight: 22,
  },
  detailBlock: {
    gap: 2,
    paddingTop: spacing.xs,
  },
  detailLabel: {
    color: colors.tertiaryLabel,
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: colors.label,
    fontSize: 14,
    lineHeight: 19,
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 180,
  },
  stateText: {
    color: colors.secondaryLabel,
  },
  errorText: {
    color: colors.destructive,
    textAlign: 'center',
  },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.accentSurface,
  },
  retryText: {
    color: colors.accent,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 280,
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 320,
    color: colors.secondaryLabel,
    lineHeight: 21,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.66,
    transform: [{ scale: 0.96 }],
  },
});
