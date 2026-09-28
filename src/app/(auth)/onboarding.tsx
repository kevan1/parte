import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { setOnboardingCompleted } from '@/data/onboarding-store';
import { PrimaryButton } from '@/components/ui/primary-button';
import { WorkPreview } from '@/components/onboarding/work-preview';
import { colors, spacing } from '@/theme/tokens';

const STEPS = [
  { title: 'Contá qué\nhiciste.', body: 'Escribí o dictá la actividad y cuánto tiempo te llevó. Como se lo contarías a un compañero.' },
  { title: 'Revisá. Después\nguardá.', body: 'La nota se convierte en un borrador. Confirmá el proyecto, la fecha y las horas. Vos tenés la última palabra.' },
  { title: 'Tu trabajo,\nal día.', body: 'Consultá tus horas y retomá las tareas abiertas. Cada nueva actividad queda en su lugar.' },
] as const;

export default function OnboardingRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const completing = useRef(false);
  const mounted = useRef(true);
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = step === STEPS.length - 1;

  const previous = useCallback(() => {
    if (completing.current) return true;
    if (step === 0) return false;
    setStep(step - 1);
    scroll.current?.scrollTo({ y: 0, animated: false });
    return true;
  }, [step]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', previous);
    return () => subscription.remove();
  }, [previous]);

  const complete = async () => {
    if (completing.current) return;
    completing.current = true;
    setFinishing(true);
    setError(null);
    try {
      await setOnboardingCompleted();
      if (mounted.current) router.replace('/sign-in');
    } catch {
      completing.current = false;
      if (!mounted.current) return;
      setFinishing(false);
      setError('No pudimos guardar tu avance. Intentá de nuevo.');
    }
  };

  const next = () => {
    if (completing.current) return;
    if (last) { void complete(); return; }
    setStep(Math.min(step + 1, STEPS.length - 1));
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <ScrollView
      ref={scroll}
      testID="onboarding-scroll"
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{
        headerShown: true,
        title: 'Parte',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Omitir" disabled={finishing} onPress={() => void complete()} style={({ pressed }) => [styles.skip, { opacity: pressed || finishing ? 0.5 : 1 }]}>
            <Text style={styles.skipLabel}>Omitir</Text>
          </Pressable>
        ),
      }} />
      <View style={styles.main}>
        <View style={styles.exampleLabel}><Text style={styles.eyebrow}>Ejemplo</Text></View>
        <Animated.View key={step} entering={reducedMotion ? undefined : FadeIn.duration(180)}>
          <WorkPreview step={step} />
          <View style={styles.explanation}>
            <Text accessibilityRole="header" style={styles.title}>{STEPS[step].title}</Text>
            <Text style={styles.body}>{STEPS[step].body}</Text>
          </View>
        </Animated.View>
      </View>
      <View style={styles.footer}>
        <View accessible accessibilityLabel={`Paso ${step + 1} de ${STEPS.length}`} accessibilityLiveRegion="polite" style={styles.progress}>
          {STEPS.map((_, index) => <View key={index} style={[styles.dot, index === step && styles.activeDot]} />)}
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton label={last ? 'Ingresar con mi email' : 'Continuar'} loading={finishing} disabled={finishing} onPress={next} style={styles.primary} />
        {step > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Anterior" disabled={finishing} onPress={previous} style={({ pressed }) => [styles.previous, { opacity: pressed || finishing ? 0.5 : 1 }]}>
            <Text style={styles.secondary}>Anterior</Text>
          </Pressable>
        ) : <View style={styles.previous}><Text style={styles.footnote}>Tus horas se guardan cuando las confirmás.</Text></View>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.xl },
  main: { flexGrow: 1, justifyContent: 'center', paddingBottom: spacing.lg },
  exampleLabel: { alignItems: 'center' },
  eyebrow: { color: colors.secondaryLabel, fontSize: 13, fontWeight: '500' },
  explanation: { gap: spacing.lg, paddingTop: spacing.xl },
  title: { color: colors.label, fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.5 },
  body: { color: colors.secondaryLabel, fontSize: 17, lineHeight: 24 },
  footer: { gap: spacing.sm },
  progress: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, borderCurve: 'continuous', backgroundColor: colors.separator },
  activeDot: { width: 24, backgroundColor: colors.label },
  primary: { minHeight: 56, paddingVertical: spacing.md },
  previous: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  secondary: { color: colors.secondaryLabel, fontSize: 15, fontWeight: '500' },
  footnote: { color: colors.secondaryLabel, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  skip: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  skipLabel: { color: colors.secondaryLabel, fontSize: 15 },
  error: { color: colors.destructive, fontSize: 15, lineHeight: 20 },
});
