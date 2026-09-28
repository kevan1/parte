import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';

import type { EditableTimeEntryDraft } from '@/domain/types';
import { applyDurationEdit } from '@/domain/time-normalization';
import { FormField } from '@/components/ui/form-field';
import { colors, radius, spacing } from '@/theme/tokens';

type DraftCardProps = {
  index: number;
  draft: EditableTimeEntryDraft;
  onChange: (patch: Partial<EditableTimeEntryDraft>) => void;
  onWorkDateChange: (workDate: string) => void;
  onAcceptSuggestion: () => void;
  onUseNewStream: () => void;
};

function ChoiceButton({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={handlePress}
      style={({ pressed }) => ({
        minHeight: 44,
        flex: 1,
        borderRadius: radius.sm,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        backgroundColor: selected ? colors.accent : colors.accentSurface,
        opacity: pressed ? 0.75 : 1,
        transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
      })}
    >
      <Text style={{ color: selected ? colors.background : colors.accent, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function DraftCard({
  index,
  draft,
  onChange,
  onWorkDateChange,
  onAcceptSuggestion,
  onUseNewStream,
}: DraftCardProps) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        padding: spacing.md,
        gap: spacing.md,
      }}
    >
      <Text selectable style={{ color: colors.label, fontSize: 18, fontWeight: '700' }}>
        Entrada {index + 1}
      </Text>
      <FormField
        label="Proyecto"
        required
        value={draft.projectName}
        maxLength={120}
        onChangeText={(projectName) => onChange({ projectName })}
      />
      {draft.projectSuggestion ? (
        <View
          accessibilityRole="summary"
          style={{
            borderRadius: radius.sm,
            borderCurve: 'continuous',
            backgroundColor: colors.accentSurface,
            padding: spacing.sm,
          }}
        >
          <Text selectable style={{ color: colors.label, lineHeight: 20 }}>
            “{draft.projectSuggestion.inputName}” coincide con el proyecto existente “
            {draft.projectSuggestion.existingName}”. Se guardará allí; podés editar el proyecto si
            no corresponde.
          </Text>
        </View>
      ) : null}
      <FormField
        label="Tarea"
        required
        value={draft.taskDescription}
        maxLength={500}
        onChangeText={(taskDescription) => onChange({ taskDescription })}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <FormField
            label="Fecha"
            required
            value={draft.workDate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onChangeText={onWorkDateChange}
          />
        </View>
        <View style={{ flex: 1 }}>
          <FormField
            label="Horas"
            required
            value={draft.durationInput}
            keyboardType="decimal-pad"
            onChangeText={(value) => {
              try {
                onChange({ durationInput: value, ...applyDurationEdit(draft, value) });
              } catch {
                onChange({ durationInput: value });
              }
            }}
          />
        </View>
      </View>
      {draft.startTime && draft.endTime ? (
        <Text selectable style={{ color: colors.secondaryLabel }}>
          Rango detectado: {draft.startTime}–{draft.endTime}
        </Text>
      ) : null}
      <FormField
        label="Notas"
        value={draft.notes ?? ''}
        multiline
        maxLength={2_000}
        onChangeText={(notes) => onChange({ notes: notes || null })}
      />
      {draft.suggestedWorkStreamId ? (
        <View style={{ gap: spacing.sm }}>
          <Text selectable style={{ color: colors.label, fontWeight: '600' }}>
            ¿Continúa “{draft.suggestedWorkStream?.taskDescription ?? 'esta tarea reciente'}” de{' '}
            {draft.suggestedWorkStream?.projectName ?? 'este proyecto'}?
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ChoiceButton
              label="Sí, continuar"
              selected={draft.continuityChoice === 'existing'}
              onPress={onAcceptSuggestion}
            />
            <ChoiceButton
              label="No, tarea nueva"
              selected={draft.continuityChoice === 'new'}
              onPress={onUseNewStream}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
