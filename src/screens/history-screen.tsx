import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { HistoryEntryRow } from '@/components/time-entry/history-entry-row';
import { formatDecimalHours } from '@/domain/time-normalization';
import { buildWeekSummary, todayInTimeZone } from '@/domain/week-summary';
import { historyStore, useHistoryStore } from '@/state/history';
import { colors, radius, spacing } from '@/theme/tokens';
import { useSession } from '@/providers/session-provider';

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

export function HistoryScreen() {
  const router = useRouter();
  const status = useHistoryStore((state) => state.status);
  const entries = useHistoryStore((state) => state.entries);
  const errorMessage = useHistoryStore((state) => state.errorMessage);
  const isStale = useHistoryStore((state) => state.isStale);
  const { sessionIdentityChanged } = useSession();
  const summary = useMemo(() => buildWeekSummary(entries, todayInTimeZone()), [entries]);
  const hasReliableTotals = entries.length > 0 || status !== 'error';
  const isLoadingInitialHistory = status === 'loading' && entries.length === 0;
  const historySkeletonRows = [0, 1, 2];
  const [showSkeleton, setShowSkeleton] = useState(false);
  const shouldLoadOnFocus = status === 'idle' || status === 'error' || isStale;

  useEffect(() => {
    if (!isLoadingInitialHistory) {
      setShowSkeleton(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoadingInitialHistory]);

  useFocusEffect(
    useCallback(() => {
      if (shouldLoadOnFocus) {
        void historyStore.getState().load();
      }
    }, [shouldLoadOnFocus]),
  );

  return (
    <ScrollView
      testID="history-scroll"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={status === 'loading' && entries.length > 0}
          onRefresh={() => void historyStore.getState().load()}
        />
      }
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, flexGrow: 1 }}
    >
      {hasReliableTotals && !isLoadingInitialHistory ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View
          style={{
            flex: 1,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.accentSurface,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <Text style={{ color: colors.secondaryLabel, fontWeight: '600' }}>Hoy</Text>
          <Text selectable style={{ color: colors.accent, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {formatDecimalHours(summary.todayMinutes)} h
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <Text style={{ color: colors.secondaryLabel, fontWeight: '600' }}>Esta semana</Text>
          <Text selectable style={{ color: colors.label, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {formatDecimalHours(summary.weekMinutes)} h
          </Text>
        </View>
      </View> : null}

      {isLoadingInitialHistory && showSkeleton ? (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View
              style={{
                flex: 1,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.accentSurface,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <View style={{ width: '42%', height: 12, borderRadius: 6, backgroundColor: colors.separator }} />
              <View style={{ width: '60%', height: 28, borderRadius: 6, backgroundColor: colors.accentSurface, opacity: 0.65 }} />
            </View>
            <View
              style={{
                flex: 1,
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: colors.surface,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <View style={{ width: '38%', height: 12, borderRadius: 6, backgroundColor: colors.separator }} />
              <View style={{ width: '54%', height: 28, borderRadius: 6, backgroundColor: colors.surface, opacity: 0.75 }} />
            </View>
          </View>
          {historySkeletonRows.map((row) => (
            <View key={`history-skeleton-${row}`} style={{ gap: spacing.sm }}>
              <View style={{ width: '48%', height: 16, borderRadius: 6, backgroundColor: colors.separator }} />
              <View
                style={{
                  minHeight: 82,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  backgroundColor: colors.surface,
                  padding: spacing.md,
                  gap: spacing.sm,
                }}
              >
                <View style={{ width: '66%', height: 12, borderRadius: 5, backgroundColor: colors.separator }} />
                <View style={{ width: '52%', height: 12, borderRadius: 5, backgroundColor: colors.accentSurface }} />
                <View style={{ width: '78%', height: 12, borderRadius: 5, backgroundColor: colors.accentSurface, opacity: 0.8 }} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {errorMessage ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="alert" selectable style={{ color: colors.destructive }}>
            {errorMessage}
          </Text>
          {isStale ? (
            <Text selectable style={{ color: colors.warning }}>
              Estás viendo la última información disponible.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void historyStore.getState().load();
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Text style={{ color: colors.accent, fontWeight: '600' }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {sessionIdentityChanged && status === 'success' && entries.length === 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text selectable style={{ color: colors.warning, fontWeight: '700', textAlign: 'center' }}>
            Detectamos un cambio de cuenta.
          </Text>
          <Text selectable style={{ color: colors.label, textAlign: 'center' }}>
            Entraste con otro usuario ({sessionIdentityChanged.currentEmail || 'correo no informado'}).
            Tus horas cargadas antes eran de {sessionIdentityChanged.previousEmail || 'otro usuario'}.
            Si querías mantener las mismas, iniciá sesión otra vez con el correo original.
          </Text>
        </View>
      ) : null}

      {status === 'success' && entries.length === 0 ? (
        <View style={{ flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
          <Text selectable style={{ color: colors.label, fontSize: 22, fontWeight: '700' }}>
            Todavía no cargaste horas
          </Text>
          <Text selectable style={{ color: colors.secondaryLabel, textAlign: 'center' }}>
            Andá a Registrar y contá en qué trabajaste.
          </Text>
        </View>
      ) : null}

      {summary.days.map((day) => (
        <View key={day.date} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text selectable style={{ color: colors.label, fontSize: 18, fontWeight: '700', textTransform: 'capitalize' }}>
              {formatDate(day.date)}
            </Text>
            <Text selectable style={{ color: colors.secondaryLabel, fontVariant: ['tabular-nums'] }}>
              {formatDecimalHours(day.minutes)} h
            </Text>
          </View>
          {day.entries.map((entry, entryIndex) => (
            <HistoryEntryRow
              key={entry.id}
              entry={entry}
              index={entryIndex}
              onPress={() => router.push({ pathname: '/entry/[id]', params: { id: entry.id } })}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
