import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { Color } from 'expo-router';
import { Image } from 'expo-image';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import appIcon from '../../../assets/icon.png';
import { authService } from '@/data/supabase';
import { FormField } from '@/components/ui/form-field';
import { PrimaryButton } from '@/components/ui/primary-button';
import { spacing } from '@/theme/tokens';

type PendingAction = 'magic-link' | 'code' | null;

const uiColors = {
  background: Platform.select({
    ios: Color.ios.systemBackground,
    android: Color.android.dynamic.surface,
    default: '#F5F6F2',
  })!,
  label: Platform.select({
    ios: Color.ios.label,
    android: Color.android.dynamic.onSurface,
    default: '#1B1D1A',
  })!,
  secondaryLabel: Platform.select({
    ios: Color.ios.secondaryLabel,
    android: Color.android.dynamic.onSurfaceVariant,
    default: '#3A3A3A',
  })!,
} as const;

export default function SignInRoute() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'email' | 'code'>('email');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.replace(/\D/g, '').slice(0, 6);
  const hasValidCode = normalizedCode.length === 6;
  const hasEmail = email.trim().length > 0;
  const isBusy = pendingAction !== null;

  const submitMagicLink = async () => {
    setPendingAction('magic-link');
    setError(null);
    try {
      await authService.sendMagicLink(email);
      goToCodeMode();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Revisá el email e intentá nuevamente.';
      setError(`No pudimos enviar el enlace. ${message}`);
    } finally {
      setPendingAction(null);
    }
  };

  const submitCode = async () => {
    setPendingAction('code');
    setError(null);
    try {
      await authService.verifyEmailCode(normalizedEmail, normalizedCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Revisá el código e intentá nuevamente.';
      setError(`No pudimos validar el código. ${message}`);
    } finally {
      setPendingAction(null);
    }
  };

  const resetEmail = () => {
    setMode('email');
    setCode('');
    setError(null);
  };

  const goToCodeMode = () => {
    setMode('code');
    setError(null);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: uiColors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          padding: spacing.lg,
          justifyContent: 'center',
          gap: spacing.lg,
        }}
      >
      <View style={{ gap: spacing.md, alignItems: 'center' }}>
        <Image
          source={appIcon}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
          }}
        />
        <Text selectable style={{ color: uiColors.label, fontSize: 22, fontWeight: '700' }}>
          Parte
        </Text>
      </View>

      <View style={{ gap: spacing.md }}>
        <Text selectable style={{ color: uiColors.label, fontSize: 26, fontWeight: '700' }}>
          {mode === 'email' ? 'Ingresá tu email' : 'Ingresá el código'}
        </Text>
        <Text selectable style={{ color: uiColors.secondaryLabel, fontSize: 15 }}>
          {mode === 'email'
            ? 'Recibirás un enlace y un código de verificación.'
            : `Código enviado a ${normalizedEmail}`}
        </Text>
      </View>

      <View style={{ gap: spacing.md }}>
        <FormField
          label={mode === 'email' ? 'Email laboral' : 'Código de 6 dígitos'}
          required
          value={mode === 'email' ? email : code}
          onChangeText={mode === 'email' ? setEmail : (value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          error={error}
          keyboardType={mode === 'email' ? 'email-address' : 'number-pad'}
          autoCapitalize="none"
          autoComplete={mode === 'email' ? 'email' : 'one-time-code'}
          textContentType={mode === 'email' ? 'emailAddress' : 'oneTimeCode'}
          returnKeyType={mode === 'email' ? 'next' : 'done'}
          maxLength={mode === 'email' ? undefined : 6}
          onSubmitEditing={() => {
            if (isBusy) return;
            if (mode === 'email' && hasEmail) {
              void submitMagicLink();
              return;
            }
            if (mode === 'code' && hasValidCode) {
              void submitCode();
            }
          }}
        />

        <PrimaryButton
          label={mode === 'email' ? 'Enviar enlace y código' : 'Ingresar'}
          loading={mode === 'email' ? pendingAction === 'magic-link' : pendingAction === 'code'}
          disabled={
            (mode === 'email' ? !hasEmail : !hasValidCode) || isBusy
          }
          onPress={() => {
            if (mode === 'email') {
              void submitMagicLink();
              return;
            }
            void submitCode();
          }}
        />

        {mode === 'code' ? (
          <PrimaryButton
            label="Usar otro email"
            variant="plain"
            disabled={isBusy}
            onPress={resetEmail}
          />
        ) : null}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
