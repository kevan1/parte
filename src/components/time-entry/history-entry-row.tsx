import * as Haptics from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo, useCallback, useRef } from 'react';
import { Alert, Pressable, Text, View, type ColorValue, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';

import { formatDecimalHours } from '@/domain/time-normalization';
import type { TimeEntry } from '@/domain/types';
import { colors, radius, spacing } from '@/theme/tokens';

type HistoryEntryRowProps = {
  entry: TimeEntry;
  index: number;
  onPress: () => void;
};

const actionButtonBaseStyle: ViewStyle = {
  width: 94,
  minHeight: 72,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: spacing.md,
  gap: 4,
};

function HistoryActionButton({
  label,
  icon,
  onPress,
  backgroundColor,
  labelColor,
  testID,
}: {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  backgroundColor: ColorValue;
  labelColor: string;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{
        ...actionButtonBaseStyle,
        backgroundColor,
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      }]}
    >
      <SymbolView
        name={icon}
        size={18}
        tintColor={labelColor}
        fallback={null}
      />
      <Text style={{ color: labelColor, fontWeight: '600', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

const entryDateStyle = {
  borderRadius: radius.md,
  borderCurve: 'continuous' as const,
  backgroundColor: colors.surface,
  padding: spacing.md,
  gap: spacing.xs,
};

const controlForeground = colors.background as unknown as string;

function HistoryEntryRowInternal({ entry, index, onPress }: HistoryEntryRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);

  const close = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const openEdit = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    close();
    onPress();
  }, [close, onPress]);

  const openDeleteNotice = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    close();
    Alert.alert(
      'No se pueden borrar horas cargadas',
      'En esta versión no permitimos eliminar registros cargados para mantener la trazabilidad. Podés abrirla y corregir los datos.',
      [
        { text: 'Editar', onPress: onPress },
        { text: 'Entendido', style: 'cancel' },
      ],
    );
  }, [close, onPress]);

  const renderRightActions = useCallback(
    () => (
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', borderRadius: radius.md }}>
        <HistoryActionButton
          testID={`history-entry-edit-${entry.id}`}
          label="Editar"
          icon="pencil"
          backgroundColor={colors.accent}
          labelColor={controlForeground}
          onPress={openEdit}
        />
        <HistoryActionButton
          testID={`history-entry-delete-${entry.id}`}
          label="Eliminar"
          icon="trash"
          backgroundColor={colors.destructive}
          labelColor={controlForeground}
          onPress={openDeleteNotice}
        />
      </View>
    ),
    [entry.id, openDeleteNotice, openEdit],
  );

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} rightThreshold={40} overshootRight={false}>
      <Animated.View
        entering={FadeIn.duration(180).delay(Math.min(index, 20) * 18)}
        style={{ marginBottom: spacing.sm }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Editar ${entry.taskDescription}, ${formatDecimalHours(entry.durationMinutes)} horas`}
          onPress={onPress}
          style={({ pressed }) => ({
            ...entryDateStyle,
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text
              selectable
              numberOfLines={1}
              style={{ flex: 1, color: colors.label, fontWeight: '700' }}
            >
              {entry.projectName}
            </Text>
            <Text selectable style={{ color: colors.accent, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {formatDecimalHours(entry.durationMinutes)} h
            </Text>
          </View>
          <Text selectable numberOfLines={2} style={{ color: colors.secondaryLabel }}>
            {entry.taskDescription}
          </Text>
        </Pressable>
      </Animated.View>
    </Swipeable>
  );
}

export const HistoryEntryRow = memo(HistoryEntryRowInternal);
