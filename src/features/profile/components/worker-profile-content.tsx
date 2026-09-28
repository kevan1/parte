import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { NotificationTestCard } from '@/features/notifications/notification-test-card';
import { SignOutButton } from '@/components/auth/sign-out-button';
import type { WorkerProfile, WorkerRole } from '@/data/profile-repository';
import { WorkerAvatar } from '@/features/profile/components/worker-avatar';
import { colors, radius, spacing } from '@/theme/tokens';

type WorkerProfileContentProps = {
  error?: string;
  loading?: boolean;
  onRetry?: () => void;
  profile?: WorkerProfile;
};

const ROLE_LABELS: Record<WorkerRole, string> = {
  admin: 'Administrador',
  employee: 'Empleado',
  external: 'Colaborador externo',
};

function formatJoinDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(value))
    .replace(/\./g, '');
}

export function WorkerProfileContent({
  error,
  loading = false,
  onRetry,
  profile,
}: WorkerProfileContentProps) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, gap: spacing.lg }}
    >
      {loading ? (
        <View
          accessible
          accessibilityLabel="Cargando tu perfil"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}

      {error ? (
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
          <Text accessibilityRole="alert" selectable style={{ color: colors.destructive }}>
            {error}
          </Text>
          {onRetry ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {profile ? (
        <>
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }}>
            <WorkerAvatar avatarUrl={profile.avatarUrl} name={profile.name} />
            <Text selectable style={{ color: colors.label, fontSize: 28, fontWeight: '700' }}>
              {profile.name}
            </Text>
            <Text selectable style={{ color: colors.secondaryLabel, fontSize: 16 }}>
              {ROLE_LABELS[profile.role]}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: colors.surface,
              borderCurve: 'continuous',
              borderRadius: radius.md,
              overflow: 'hidden',
              paddingHorizontal: spacing.lg,
            }}
          >
            <ProfileRow label="Email laboral" value={profile.email} />
            <ProfileRow label="Rol" value={ROLE_LABELS[profile.role]} withSeparator />
            <ProfileRow label="Miembro desde" value={formatJoinDate(profile.createdAt)} withSeparator />
            <ProfileRow label="ID de trabajador" value={profile.id} withSeparator />
          </View>

          <NotificationTestCard />
        </>
      ) : null}

      <View style={{ alignItems: 'center' }}>
        <SignOutButton />
      </View>
    </ScrollView>
  );
}

function ProfileRow({
  label,
  value,
  withSeparator = false,
}: {
  label: string;
  value: string;
  withSeparator?: boolean;
}) {
  return (
    <View
      style={{
        borderTopColor: colors.separator,
        borderTopWidth: withSeparator ? 1 : 0,
        gap: spacing.xs,
        paddingVertical: spacing.md,
      }}
    >
      <Text style={{ color: colors.secondaryLabel, fontSize: 13, fontWeight: '600' }}>
        {label}
      </Text>
      <Text selectable style={{ color: colors.label, fontSize: 16 }}>
        {value}
      </Text>
    </View>
  );
}
