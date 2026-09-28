import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { configureForegroundNotifications, getTestPushReceipt, sendTestPush } from './push-test-service';
import { colors, radius, spacing } from '@/theme/tokens';

export function NotificationTestCard() {
  const [busy, setBusy] = useState<'send' | 'receipt' | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    configureForegroundNotifications();
    return () => { mounted.current = false; };
  }, []);

  const run = async (action: 'send' | 'receipt') => {
    if (locked.current || (action === 'receipt' && !ticket)) return;
    locked.current = true;
    setBusy(action);
    setError(null);
    setMessage(null);
    if (action === 'send') setTicket(null);
    try {
      if (action === 'send') {
        const result = await sendTestPush();
        if (!mounted.current) return;
        setTicket(result.ticketId);
        setMessage('Prueba enviada. Esperá el aviso en este dispositivo.');
      } else {
        const result = await getTestPushReceipt(ticket!);
        if (!mounted.current) return;
        setMessage(result === 'accepted'
          ? 'El servicio de notificaciones aceptó el envío. Confirmá si el aviso apareció en tu dispositivo.'
          : 'El envío sigue pendiente. Podés comprobarlo nuevamente en unos minutos.');
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'No se pudo enviar la prueba.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  return <View style={styles.card}>
    <Text style={styles.title}>Notificaciones</Text>
    <Text style={styles.detail}>Enviá una prueba a este dispositivo. Te pediremos permiso si todavía no lo diste.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={busy === 'send' ? 'Enviando prueba' : 'Probar notificación'} accessibilityState={{ disabled: busy !== null }} disabled={busy !== null} onPress={() => void run('send')} style={styles.button}>
      {busy === 'send' ? <ActivityIndicator /> : <Text style={styles.buttonText}>Probar notificación</Text>}
    </Pressable>
    {ticket ? <Pressable accessibilityRole="button" accessibilityLabel="Comprobar envío" accessibilityState={{ disabled: busy !== null }} disabled={busy !== null} onPress={() => void run('receipt')} style={styles.button}>
      {busy === 'receipt' ? <ActivityIndicator /> : <Text style={styles.buttonText}>Comprobar envío</Text>}
    </Pressable> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.detail}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings().catch(() => { if (mounted.current) setError('Abrí Ajustes y buscá Parte para revisar los permisos.'); })} style={styles.settings}>
      <Text style={styles.detail}>Abrir ajustes de la app</Text>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.label, fontSize: 18, fontWeight: '600' },
  detail: { color: colors.secondaryLabel, fontSize: 14, lineHeight: 20 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  buttonText: { color: colors.label, fontSize: 16, fontWeight: '600' },
  settings: { minHeight: 44, justifyContent: 'center' },
  error: { color: colors.destructive, fontSize: 14 },
});
