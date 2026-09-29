import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

import { statusColor } from '@/features/availability/availability-indicator';
import { useAvailability } from '@/features/availability/availability-provider';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { WorkerAvatar } from '@/features/profile/components/worker-avatar';
import { colors, radius, spacing } from '@/theme/tokens';

export type AppDestination = 'register' | 'history';

type AppMenuProps = {
  activeDestination: AppDestination;
  bottomInset: number;
  menuWidth: number;
  newEntryDisabled?: boolean;
  onNewEntry: () => void;
  onProfilePress: () => void;
  onSchedulesPress?: () => void;
  onAssignTaskPress?: () => void;
  onSelectDestination: (destination: AppDestination) => void;
  topInset: number;
  avatarUrl?: string;
  userEmail?: string;
  workerName?: string;
};

const DESTINATIONS: readonly {
  accessibilityLabel: string;
  destination: AppDestination;
  icon: SymbolViewProps['name'];
  label: string;
}[] = [
  {
    accessibilityLabel: 'Registrar horas',
    destination: 'register',
    icon: { ios: 'text.bubble', android: 'chat', web: 'chat' },
    label: 'Registrar',
  },
  {
    accessibilityLabel: 'Mis horas',
    destination: 'history',
    icon: { ios: 'clock', android: 'history', web: 'history' },
    label: 'Mis horas',
  },
];

export function AppMenu({
  activeDestination,
  bottomInset,
  menuWidth,
  newEntryDisabled = false,
  onNewEntry,
  onProfilePress,
  onSchedulesPress,
  onAssignTaskPress,
  onSelectDestination,
  topInset,
  avatarUrl,
  userEmail,
  workerName = 'Trabajador',
}: AppMenuProps) {
  const { kind, label, manual } = useAvailability();
  const handleDestinationPress = useCallback(
    (destination: AppDestination) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelectDestination(destination);
    },
    [onSelectDestination],
  );

  const handleNewEntryPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onNewEntry();
  }, [onNewEntry]);

  const handleProfilePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onProfilePress();
  }, [onProfilePress]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingBottom: Math.max(bottomInset, spacing.lg),
          paddingTop: Math.max(topInset, spacing.lg),
          width: menuWidth,
        },
      ]}
    >
      <Text selectable style={styles.title}>
        Horas
      </Text>
      <Text selectable style={styles.subtitle}>
        Navegación
      </Text>

      <ScrollView
        contentContainerStyle={styles.destinationList}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {onSchedulesPress ? <Pressable accessibilityRole="button" onPress={onSchedulesPress} style={styles.destination}><Text style={styles.destinationLabel}>Jornadas</Text></Pressable> : null}
        {onAssignTaskPress ? <Pressable accessibilityLabel="Asignar tarea a un empleado" accessibilityRole="button" onPress={onAssignTaskPress} style={styles.destination}><Text style={styles.destinationLabel}>Asignar tarea</Text></Pressable> : null}
        {DESTINATIONS.map(({ accessibilityLabel, destination, icon, label }) => {
          const selected = activeDestination === destination;

          return (
            <Pressable
              key={destination}
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => handleDestinationPress(destination)}
              style={({ pressed }) => [
                styles.destination,
                selected && styles.destinationSelected,
                pressed && styles.pressed,
                !selected && pressed && styles.destinationPressed,
              ]}
            >
              <SymbolView name={icon} size={22} tintColor={colors.label} />
              <Text style={styles.destinationLabel}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel="Nuevo registro"
          accessibilityRole="button"
          accessibilityState={{ disabled: newEntryDisabled }}
          disabled={newEntryDisabled}
          onPress={handleNewEntryPress}
          style={({ pressed }) => [
            styles.newCapture,
            newEntryDisabled && styles.disabled,
            pressed && styles.pressed,
            pressed && styles.destinationPressed,
          ]}
        >
          <SymbolView
            name={{ ios: 'square.and.pencil', android: 'add_comment', web: 'add_comment' }}
            size={20}
            tintColor={colors.background}
          />
          <Text style={styles.newCaptureLabel}>Nuevo registro</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Abrir perfil de ${workerName}`}
          accessibilityValue={{ text: `${label}${manual ? ' · Manual' : ''}` }}
          accessibilityRole="button"
          onPress={handleProfilePress}
          style={({ pressed }) => [styles.profileButton, pressed && styles.destinationPressed]}
        >
          <WorkerAvatar accessible={false} avatarUrl={avatarUrl} name={workerName} size={52} />
          <View pointerEvents="none" style={[styles.availabilityDot, { backgroundColor: statusColor(kind) }]} />
        </Pressable>
      </View>

      <View style={styles.accountRow}>
        <View style={styles.accountCopy}>
          <Text style={styles.accountTitle}>Tu cuenta</Text>
          {userEmail ? (
            <Text selectable numberOfLines={1} style={styles.accountEmail}>
              {userEmail}
            </Text>
          ) : null}
        </View>
        <SignOutButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.label,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: '600',
    paddingTop: spacing.xs,
  },
  destinationList: {
    gap: spacing.xs,
    paddingTop: spacing.xl,
  },
  destination: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  destinationSelected: {
    backgroundColor: colors.accentSurface,
  },
  destinationLabel: {
    color: colors.label,
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  newCapture: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderCurve: 'continuous',
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  newCaptureLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  availabilityDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.background,
  },
  profileButton: {
    alignSelf: 'center',
    borderCurve: 'continuous',
    borderRadius: 999,
    minHeight: 52,
    minWidth: 52,
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  accountCopy: {
    flex: 1,
  },
  accountTitle: {
    color: colors.label,
    fontSize: 14,
    fontWeight: '600',
  },
  accountEmail: {
    color: colors.secondaryLabel,
    fontSize: 12,
    paddingTop: 2,
  },
  pressed: {
    opacity: 0.55,
  },
  destinationPressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.45,
  },
});
