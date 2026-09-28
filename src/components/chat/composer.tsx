import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

import { colors, spacing } from '@/theme/tokens';

type AttachmentAction = 'camera' | 'photos' | 'files';
type ChatAttachment = { id: string; uri: string; name: string; kind: 'image' | 'file'; mimeType?: string };

type ComposerProps = {
  attachments?: ChatAttachment[];
  generating: boolean;
  restoreText?: string | null;
  value?: string;
  onValueChange?: (text: string) => void;
  onAddAttachment?: (action: AttachmentAction) => void;
  onRemoveAttachment?: (id: string) => void;
  onSend: (text: string, attachments?: ChatAttachment[]) => void;
  onStop: () => void;
};

const MAX_INPUT_HEIGHT = 120;

export function Composer({ attachments = [], generating, restoreText, value, onValueChange, onAddAttachment, onRemoveAttachment, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState(restoreText ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const isControlled = value !== undefined;
  useEffect(() => {
    if (!isControlled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(restoreText ?? '');
    }
  }, [isControlled, restoreText]);
  const normalizeValue = useCallback((nextText: string) => { if (isControlled) onValueChange?.(nextText); else setText(nextText); }, [isControlled, onValueChange]);
  const visibleText = isControlled ? value ?? '' : text;
  const trimmed = useMemo(() => visibleText.trim(), [visibleText]);
  const canSend = trimmed.length > 0 && trimmed.length <= 2_000 && !generating;
  const glyphColor = useColorScheme() === 'dark' ? '#000000' : '#ffffff';
  const chooseAttachment = useCallback((action: AttachmentAction) => { setMenuOpen(false); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAddAttachment?.(action); }, [onAddAttachment]);
  const handleSend = useCallback(() => {
    if (!canSend) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    normalizeValue('');
    if (attachments.length) onSend(trimmed, attachments);
    else onSend(trimmed);
  }, [attachments, canSend, normalizeValue, onSend, trimmed]);

  return (
    <View style={styles.container}>
      {menuOpen ? <View testID="capture-attachment-menu" style={styles.menu}>
          <Pressable testID="capture-attachment-camera" accessibilityRole="button" accessibilityLabel="Usar cámara" onPress={() => chooseAttachment('camera')} style={styles.menuItem}><SymbolView name="camera.fill" size={18} tintColor={colors.label} fallback={null} /><Text style={styles.menuLabel}>Cámara</Text></Pressable>
        <Pressable testID="capture-attachment-photos" accessibilityRole="button" accessibilityLabel="Elegir fotos" onPress={() => chooseAttachment('photos')} style={styles.menuItem}><SymbolView name="photo.on.rectangle" size={18} tintColor={colors.label} fallback={null} /><Text style={styles.menuLabel}>Fotos</Text></Pressable>
        <Pressable testID="capture-attachment-files" accessibilityRole="button" accessibilityLabel="Elegir archivos" onPress={() => chooseAttachment('files')} style={styles.menuItem}><SymbolView name="paperclip" size={18} tintColor={colors.label} fallback={null} /><Text style={styles.menuLabel}>Archivos</Text></Pressable>
      </View> : null}
      <View testID="capture-composer-field" style={styles.field}>
        {attachments.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachmentStrip} contentContainerStyle={styles.attachmentContent}>
          {attachments.map((attachment) => <View key={attachment.id} testID={`capture-attachment-${attachment.id}`} accessible accessibilityLabel={`Adjunto ${attachment.name}`} style={styles.attachment}>
            {attachment.kind === 'image' ? <Image source={attachment.uri} contentFit="cover" style={styles.thumbnail} /> : <View style={styles.fileThumbnail}><SymbolView name="doc.fill" size={22} tintColor={colors.secondaryLabel} fallback={null} /></View>}
            <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
            <Pressable testID={`capture-remove-attachment-${attachment.id}`} accessibilityRole="button" accessibilityLabel={`Quitar adjunto ${attachment.name}`} hitSlop={8} onPress={() => onRemoveAttachment?.(attachment.id)} style={styles.removeAttachment}><SymbolView name="xmark" size={10} tintColor="#fff" fallback={null} /></Pressable>
          </View>)}
        </ScrollView> : null}
        <View style={styles.row}>
          <Pressable testID="capture-add-attachment" accessible accessibilityRole="button" accessibilityLabel="Agregar adjunto" accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen((open) => !open)} hitSlop={8} style={styles.addButton}><SymbolView name="plus" size={20} tintColor={colors.label} fallback={null} /></Pressable>
          <TextInput testID="capture-composer" style={styles.input} value={visibleText} onChangeText={normalizeValue} placeholder="Mensaje para Parte" placeholderTextColor={colors.tertiaryLabel} multiline maxLength={2_000} accessibilityLabel="Describí tu trabajo" />
          {generating ? <Pressable testID="capture-stop" onPress={onStop} style={styles.actionButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Detener interpretación"><View testID="capture-composer-action-circle" style={styles.actionCircle}><SymbolView name="stop.fill" size={14} tintColor={glyphColor} fallback={null} /></View></Pressable> : <Pressable testID="capture-send" onPress={handleSend} disabled={!canSend} style={styles.actionButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Interpretar registro" accessibilityState={{ disabled: !canSend }}><View testID="capture-composer-action-circle" style={[styles.actionCircle, !canSend && styles.actionCircleDisabled]}><SymbolView name="arrow.up" size={16} weight="semibold" tintColor={glyphColor} fallback={null} /></View></Pressable>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.background },
  menu: { position: 'absolute', bottom: 58, left: spacing.md, zIndex: 2, width: 190, padding: spacing.sm, gap: 2, borderRadius: 18, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, backgroundColor: colors.secondaryBackground },
  menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: 12 },
  menuLabel: { color: colors.label, fontSize: 15, fontWeight: '600' },
  field: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, backgroundColor: colors.background, borderRadius: 24, paddingHorizontal: spacing.sm + 2, paddingTop: spacing.xs + 2, paddingBottom: spacing.xs + 2, minHeight: 48 },
  attachmentStrip: { maxHeight: 76, marginBottom: spacing.xs }, attachmentContent: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  attachment: { width: 64, height: 68, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colors.fill }, thumbnail: { width: 64, height: 48 }, fileThumbnail: { width: 64, height: 48, alignItems: 'center', justifyContent: 'center' }, attachmentName: { color: colors.secondaryLabel, fontSize: 9, paddingHorizontal: 4, paddingTop: 2 }, removeAttachment: { position: 'absolute', top: 4, right: 4, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
  row: { minHeight: 38, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }, addButton: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, fontSize: 17, lineHeight: 22, maxHeight: MAX_INPUT_HEIGHT, color: colors.label, paddingTop: 8, paddingBottom: 8 }, actionButton: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }, actionCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, actionCircleDisabled: { opacity: 0.25 },
});
