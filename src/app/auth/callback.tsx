import * as Linking from 'expo-linking';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { authService } from '@/data/supabase';
import { colors, spacing } from '@/theme/tokens';
import { PrimaryButton } from '@/components/ui/primary-button';
import { useSession } from '@/providers/session-provider';

export default function AuthCallbackRoute() {
  const url = Linking.useLinkingURL();
  const router = useRouter();
  const { session } = useSession();
  const started = useRef<string | null>(null);
  const [status, setStatus] = useState<'waiting' | 'success' | 'error'>('waiting');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (session) {
      setStatus('success');
      return;
    }
    if (!url) {
      setErrorMessage('No recibimos un enlace.');
      setStatus('error');
      return;
    }
    if (!url || started.current === url) return;
    started.current = url;
    void authService
      .exchangeCallback(url)
      .then(() => setStatus('success'))
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Reintentá con un nuevo enlace.');
        setStatus('error');
      });
  }, [session, url]);

  if (status === 'success') return <Redirect href="/register" />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg }}>
      {status === 'waiting' ? <ActivityIndicator color={colors.accent} /> : null}
      <Text
        accessibilityRole={status === 'error' ? 'alert' : undefined}
        selectable
        style={{ color: status === 'error' ? colors.destructive : colors.label, textAlign: 'center' }}
      >
        {status === 'error'
          ? `No se pudo validar el enlace: ${errorMessage}`
          : 'Validando tu enlace…'}
      </Text>
      {status === 'error' ? (
        <PrimaryButton label="Solicitar otro enlace" onPress={() => router.replace('/sign-in')} />
      ) : null}
    </View>
  );
}
