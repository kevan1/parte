import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, spacing } from '@/theme/tokens';

const summaries = [
  'Ejemplo de nota: Hoy trabajé dos horas revisando una válvula en la línea de llenado.',
  'Ejemplo de borrador: Línea de llenado, revisión de válvula, hoy, dos horas. Se revisa antes de guardar.',
  'Ejemplo de tarea abierta: Línea de llenado. Revisión de válvula. Dos horas registradas. Podés continuar esta tarea.',
];

/** Product examples only: never request permissions or create real records. */
export function WorkPreview({ step }: { step: number }) {
  return (
    <View style={styles.stage} accessible accessibilityLabel={summaries[step]}>
      <View style={styles.card}>
        <View style={styles.header}>
          <SymbolView name={step === 0 ? 'text.bubble' : step === 1 ? 'square.and.pencil' : 'checklist'} size={22} tintColor={colors.label} />
          <Text style={styles.headerText}>{['Nota de trabajo', 'Registro para revisar', 'Tareas abiertas'][step]}</Text>
        </View>
        {step === 0 ? (
          <>
            <Text style={styles.note}>Hoy trabajé 2 horas revisando una válvula en la línea de llenado.</Text>
            <View style={styles.divider} />
            <View style={styles.captionRow}>
              <SymbolView name="mic" size={18} tintColor={colors.secondaryLabel} />
              <Text style={styles.caption}>Con tus palabras, por texto o voz</Text>
            </View>
          </>
        ) : step === 1 ? (
          <>
            <Detail label="Proyecto" value="Línea de llenado" />
            <View style={styles.divider} />
            <Detail label="Actividad" value="Revisión de válvula" />
            <View style={styles.divider} />
            <View style={styles.detailsRow}>
              <Detail label="Fecha" value="Hoy" />
              <Detail label="Duración" value="2 h" />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.project}>Línea de llenado</Text>
            <Text style={styles.caption}>Revisión de válvula</Text>
            <View style={styles.divider} />
            <View style={styles.captionRow}>
              <SymbolView name="clock" size={18} tintColor={colors.label} />
              <Text style={styles.total}>2 h registradas</Text>
            </View>
            <Text style={styles.status}>En curso</Text>
          </>
        )}
      </View>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { minHeight: 288, justifyContent: 'center', paddingVertical: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: 24, borderCurve: 'continuous', padding: 20, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, color: colors.label, fontSize: 15, fontWeight: '600' },
  note: { color: colors.label, fontSize: 22, lineHeight: 30, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  caption: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 20, flexShrink: 1 },
  detail: { gap: spacing.xs, flexShrink: 1 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  value: { color: colors.label, fontSize: 17, fontWeight: '500', fontVariant: ['tabular-nums'] },
  project: { color: colors.label, fontSize: 22, fontWeight: '600' },
  total: { color: colors.label, fontSize: 17, fontWeight: '500', fontVariant: ['tabular-nums'] },
  status: { color: colors.secondaryLabel, fontSize: 13, fontWeight: '600' },
});
