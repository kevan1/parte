import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMPOSER } from '@/components/chat/attachments/constants';
import { Stack, useRouter } from 'expo-router';
import { AvailabilityIndicator } from '@/features/availability/availability-indicator';
import { useHeaderHeight } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { Extrapolation, FadeInDown, FadeIn, interpolate, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import { CaptureEmptyState } from '@/components/chat/capture-empty-state';
import { CaptureTurnRow } from '@/components/chat/capture-turn-row';
import { ChatAttachmentsScreen } from '@/components/chat/attachments';
import { NewCaptureButton } from '@/components/chat/new-capture-button';
import { DraftCard } from '@/components/time-entry/draft-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { NativeCaptureHeader } from '@/components/navigation/native-capture-header';
import { completeWorkStream, getDayMinutes, listWorkStreams } from '@/data/time-entry-repository';
import { SwipeMenuButton } from '@/features/swipe-menu/components/swipe-menu-button';
import { formatDecimalHours } from '@/domain/time-normalization';
import type { WorkStream } from '@/domain/types';
import { captureStore, useCaptureStore } from '@/state/capture';
import { canConfirmDrafts } from '@/state/capture-store';
import { colors, spacing } from '@/theme/tokens';

type OpenStreamsStatus = 'loading' | 'empty' | 'error' | 'success';

const MAX_OPEN_STREAMS = 10;
const OPEN_STREAMS_SKELETON_COUNT = 3;

export function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dockHeight, setDockHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const headerHeight = useHeaderHeight();
  const { progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  // Match skeleton and loaded text slots, including the two-line description.
  const streamHeaderHeight = 20 * fontScale;
  const streamTaskHeight = 36 * fontScale;
  const streamFooterHeight = 18 * fontScale + 12;
  const streamCardHeight = streamHeaderHeight + streamTaskHeight + streamFooterHeight
    + spacing.md * 2 + spacing.xs * 3 + 2;
  const phase = useCaptureStore((state) => state.phase);
  const turns = useCaptureStore((state) => state.turns);
  const drafts = useCaptureStore((state) => state.drafts);
  const failedInput = useCaptureStore((state) => state.failedInput);
  const errorMessage = useCaptureStore((state) => state.errorMessage);
  const [composerText, setComposerText] = useState('');
  const [attachmentMode, setAttachmentMode] = useState<'closed' | 'menu' | 'photos'>('closed');
  const [attachmentCloseRequest, setAttachmentCloseRequest] = useState(0);
  const [attachmentResetRequest, setAttachmentResetRequest] = useState(0);
  const [openStreams, setOpenStreams] = useState<WorkStream[]>([]);
  const [openStreamsStatus, setOpenStreamsStatus] = useState<OpenStreamsStatus>('loading');
  const [openStreamsCompletionError, setOpenStreamsCompletionError] = useState<string | null>(null);
  const [completingStreamId, setCompletingStreamId] = useState<string | null>(null);
  const openStreamsGeneration = useRef(0);
  const mounted = useRef(true);
  const shouldStickToBottom = useRef(true);
  const hasPendingContinuity = drafts.some((draft) => draft.continuityChoice === 'pending');
  const hasInvalidDraft = drafts.length > 0 && !canConfirmDrafts(drafts);
  const newCapture = useCallback(() => {
    captureStore.getState().reset();
    setComposerText('');
    setAttachmentResetRequest((request) => request + 1);
  }, []);
  const isEmpty = turns.length === 0 && drafts.length === 0;
  const openStreamsSkeletonIndexes = Array.from({ length: OPEN_STREAMS_SKELETON_COUNT }, (_, index) => index);
  const captureHeaderTitle = attachmentMode === 'closed' ? 'Parte' : attachmentMode === 'photos' ? 'Fotos' : 'Adjuntos';

  useEffect(() => {
    return () => {
      mounted.current = false;
      openStreamsGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComposerText(failedInput ?? '');
  }, [failedInput]);

  const loadOpenStreams = useCallback(async () => {
    const requestGeneration = ++openStreamsGeneration.current;
    setOpenStreamsStatus('loading');
    setOpenStreamsCompletionError(null);
    try {
      const streams = await listWorkStreams();
      if (!mounted.current || requestGeneration !== openStreamsGeneration.current) return;

      const deduped: WorkStream[] = [];
      const seen = new Set<string>();
      for (const stream of streams.slice(0, MAX_OPEN_STREAMS)) {
        const key = `${stream.projectName.trim().toLowerCase()}|${stream.taskDescription.trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(stream);
      }

      setOpenStreams(deduped);
      setOpenStreamsStatus(deduped.length > 0 ? 'success' : 'empty');
    } catch {
      if (!mounted.current || requestGeneration !== openStreamsGeneration.current) return;
      setOpenStreams([]);
      setOpenStreamsStatus('error');
      setOpenStreamsCompletionError(null);
    }
  }, []);

  useEffect(() => {
    if (phase === 'ready' || phase === 'clarifying' || phase === 'extracting' || phase === 'saving') {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOpenStreams();
  }, [phase, loadOpenStreams]);

  const applyStreamSuggestion = useCallback((stream: WorkStream) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const suggestion = `En ${stream.projectName}: ${stream.taskDescription}`;
    setComposerText((previous) => {
      const trimmed = previous.trim();
      if (!trimmed) return `${suggestion}, `;
      if (trimmed.includes(suggestion)) return previous;
      return `${trimmed} ${suggestion}, `;
    });
  }, []);


  const markStreamCompleted = useCallback(async (stream: WorkStream) => {
    setCompletingStreamId(stream.id);
    setOpenStreamsCompletionError(null);
    try {
      await completeWorkStream(stream.id);
      if (!mounted.current) return;
      setOpenStreams((previous) => {
        const next = previous.filter((item) => item.id !== stream.id);
        setOpenStreamsStatus(next.length === 0 ? 'empty' : 'success');
        return next;
      });
    } catch (error) {
      if (!mounted.current) return;
      setOpenStreamsCompletionError(
        error instanceof Error
          ? error.message
          : 'No pudimos cerrar esa tarea. Reintentá nuevamente.',
      );
      if (openStreams.length > 0) {
        setOpenStreamsStatus('success');
      }
    } finally {
      if (mounted.current) setCompletingStreamId(null);
    }
  }, [openStreams.length]);

  const keepScrollPinned = useCallback(() => {
    if (isEmpty) return;
    if (keyboardProgress.value > 0.01 && keyboardProgress.value < 0.99) return;
    if (!shouldStickToBottom.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [isEmpty, keyboardProgress]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    shouldStickToBottom.current = distanceFromBottom <= spacing.md * 2;
  }, []);

  const openStreamsKeyboardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(keyboardProgress.value, [0, 0.35, 1], [1, 0.35, 0], Extrapolation.CLAMP),
  }));

  const openTasks = (<>
          {phase === 'idle' && openStreamsStatus !== 'success' ? (
            <Animated.View style={[styles.openStreamsWrap, openStreamsKeyboardStyle]}>
              <Text selectable style={styles.openStreamsHeader}>
                Tareas abiertas
              </Text>
              {openStreamsStatus === 'loading' ? (
                <ScrollView
                  accessibilityLabel="Cargando tareas abiertas"
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.openStreamsCarousel}
                >
                  {openStreamsSkeletonIndexes.map((index) => (
                    <View key={`stream-skeleton-${index}`} testID={`open-stream-skeleton-${index}`} style={[styles.openStreamCard, { height: streamCardHeight }]}>
                      <View style={styles.openStreamSkeletonPressArea}>
                        <View style={[styles.openStreamSkeletonHeaderRow, { height: streamHeaderHeight }]}>
                          <View style={styles.openStreamSkeletonHeader} />
                          <View style={styles.openStreamSkeletonProjectTotal} />
                        </View>
                        <View style={[styles.openStreamSkeletonTask, { height: streamTaskHeight }]} />
                      </View>
                      <View style={[styles.openStreamSkeletonFooter, { height: streamFooterHeight }]} />
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              {openStreamsStatus === 'empty' ? (
                <View testID="open-streams-state" style={[styles.openStreamsState, { minHeight: streamCardHeight }]}>
                  <Text selectable style={styles.openStreamsHint}>
                    Todavía no hay tareas recientes.
                  </Text>
                </View>
              ) : null}
              {openStreamsStatus === 'error' ? (
                <View testID="open-streams-state" style={[styles.openStreamsState, { minHeight: streamCardHeight }]}>
                  <Text style={styles.openStreamsError}>No pudimos cargar tareas abiertas.</Text>
                  <Pressable
                    accessibilityLabel="Reintentar cargar tareas abiertas"
                    accessibilityRole="button"
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      void loadOpenStreams();
                    }}
                    style={({ pressed }) => [styles.openStreamsRetry, pressed && styles.pressed]}
                  >
                    <Text style={styles.openStreamsRetryText}>Reintentar</Text>
                  </Pressable>
                </View>
              ) : null}
            </Animated.View>
          ) : null}

          {phase === 'idle' && openStreamsStatus === 'success' ? (
            <Animated.View style={[styles.openStreamsWrap, openStreamsKeyboardStyle]}>
              <Text selectable style={styles.openStreamsHeader}>
                Tareas abiertas
              </Text>
              <ScrollView
                accessibilityLabel="Tareas abiertas"
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.openStreamsCarousel}
              >
                {openStreams.map((stream) => (
                  <Animated.View
                    key={stream.id}
                    testID={`open-stream-${stream.id}`}
                    entering={reducedMotion ? undefined : FadeIn.duration(180)}
                    style={[styles.openStreamCard, { height: streamCardHeight }]}
                  >
                    <Pressable
                      accessibilityLabel={`Usar ${stream.taskDescription} de ${stream.projectName}`}
                      accessibilityRole="button"
                      onPress={() => applyStreamSuggestion(stream)}
                      style={({ pressed }) => [styles.openStreamInfoPressArea, pressed && styles.pressed]}
                    >
                      <View style={[styles.openStreamHeaderRow, { height: streamHeaderHeight }]}>
                        <Text selectable numberOfLines={1} style={styles.openStreamProject}>
                          {stream.projectName}
                        </Text>
                        <Text selectable numberOfLines={1} style={styles.openStreamProjectTotal}>
                          {stream.projectTotalMinutes == null
                            ? 'Total: --'
                            : `Total: ${formatDecimalHours(stream.projectTotalMinutes)} h`}
                        </Text>
                      </View>
                      <Text selectable numberOfLines={2} style={[styles.openStreamTask, { height: streamTaskHeight }]}>
                        {stream.taskDescription}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Marcar ${stream.taskDescription} de ${stream.projectName} como finalizada`}
                      accessibilityRole="button"
                      disabled={completingStreamId === stream.id}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        void markStreamCompleted(stream);
                      }}
                      style={({ pressed }) => [
                        styles.openStreamComplete,
                        (pressed || completingStreamId === stream.id) && styles.pressed,
                      ]}
                    >
                      <Text numberOfLines={1} style={styles.openStreamCompleteText}>
                        {completingStreamId === stream.id ? 'Cerrando…' : 'Marcar finalizada'}
                      </Text>
                    </Pressable>
                  </Animated.View>
                ))}
                {openStreamsCompletionError ? (
                  <Text accessibilityRole="alert" selectable style={styles.openStreamsError}>
                    {openStreamsCompletionError}
                  </Text>
                ) : null}
              </ScrollView>
            </Animated.View>
          ) : null}

  </>);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: captureHeaderTitle,
          headerTitle: () => <NativeCaptureHeader title={captureHeaderTitle} />,
          headerTransparent: true,
          headerBlurEffect: 'none',
          headerStyle: { backgroundColor: 'transparent' },
          headerShadowVisible: false,
          headerLeft: () => attachmentMode === 'closed' ? (
            <View style={styles.headerActions}><SwipeMenuButton /></View>
          ) : (
            <Pressable
              accessibilityLabel="Volver de adjuntos"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setAttachmentCloseRequest((request) => request + 1)}
              style={styles.attachmentHeaderBack}
            >
              <SymbolView name="chevron.left" size={22} tintColor={colors.label} fallback={null} />
            </Pressable>
          ),
          unstable_headerRightItems: Platform.OS === 'ios' ? () => [
            { type: 'custom', hidesSharedBackground: false, element: <AvailabilityIndicator variant="header" onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/availability'); }} /> },
            { type: 'spacing', spacing: 8 },
            { type: 'button', label: 'Nuevo registro', icon: { type: 'sfSymbol', name: 'plus' }, sharesBackground: false, disabled: phase === 'saving', onPress: () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); newCapture(); } },
          ] : undefined,
          headerRight: () => (
            <View style={styles.headerActions}><AvailabilityIndicator variant="header" onPress={() => router.push('/availability')} /><NewCaptureButton disabled={phase === 'saving'} onPress={newCapture} /></View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior="translate-with-padding"
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          ref={scrollRef}
          testID="capture-scroll"
          style={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: headerHeight + spacing.sm },
            isEmpty && styles.emptyContent,
            isEmpty && { paddingBottom: (dockHeight || streamCardHeight + 100) + insets.bottom + COMPOSER.keyboardGap + spacing.lg },
          ]}
          onContentSizeChange={keepScrollPinned}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          showsVerticalScrollIndicator={false}
        >
          {isEmpty ? <CaptureEmptyState keyboardProgress={keyboardProgress} /> : null}

          {!isEmpty ? openTasks : null}

          {turns.map((turn, index) => (
            <CaptureTurnRow key={`${index}-${turn.role}`} turn={turn} animateIn />
          ))}

          {phase === 'extracting' ? (
            <CaptureTurnRow
              turn={{ role: 'assistant', content: '' }}
              animateIn
              showTypingIndicator
            />
          ) : null}

          {drafts.map((draft, index) => (
            <Animated.View
              key={draft.clientId}
              entering={FadeInDown.duration(170).delay(index * 30)}
              style={styles.cardWrap}
            >
              <DraftCard
                index={index}
                draft={draft}
                onChange={(patch) => captureStore.getState().updateDraft(index, patch)}
                onWorkDateChange={(workDate) => {
                  const targetClientId = draft.clientId;
                  captureStore.getState().updateDraft(index, {
                    workDate,
                    existingDayDate: undefined,
                    existingDayMinutes: undefined,
                  });
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return;
                  void getDayMinutes(workDate)
                    .then((existingDayMinutes) => {
                      const current = captureStore.getState().drafts[index];
                      if (current?.clientId !== targetClientId || current.workDate !== workDate) {
                        return;
                      }
                      captureStore.getState().updateDraft(index, {
                        existingDayDate: workDate,
                        existingDayMinutes,
                      });
                    })
                    .catch(() => undefined);
                }}
                onAcceptSuggestion={() => captureStore.getState().acceptSuggestion(index)}
                onUseNewStream={() => captureStore.getState().useNewStream(index)}
              />
            </Animated.View>
          ))}

          {errorMessage ? (
            <Text accessibilityRole="alert" selectable style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}

          {drafts.length > 0 ? (
            <View style={styles.confirmWrap}>
              {hasPendingContinuity ? (
                <Text selectable style={styles.warningText}>
                  Elegí si cada sugerencia continúa una tarea o crea una nueva.
                </Text>
              ) : null}
              <PrimaryButton
                label={phase === 'saved' ? 'Horas guardadas' : 'Confirmar y guardar'}
                loading={phase === 'saving'}
                disabled={hasPendingContinuity || hasInvalidDraft || phase === 'saved'}
                onPress={() => {
                  Keyboard.dismiss();
                  void captureStore.getState().confirm();
                }}
              />
              {phase === 'saved' ? (
                <PrimaryButton
                  label="Registrar otra actividad"
                  variant="soft"
                  onPress={newCapture}
                />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

      </KeyboardAvoidingView>
      {phase !== 'ready' && phase !== 'saving' && phase !== 'saved' ? (
        <View pointerEvents="box-none" style={styles.attachmentComposerOverlay}>
          <ChatAttachmentsScreen
            value={composerText}
            onValueChange={setComposerText}
            generating={phase === 'extracting'}
            onSend={(text, attachments) => {
              setComposerText('');
              void captureStore.getState().submit(text, attachments);
            }}
            onStop={newCapture}
            closeRequest={attachmentCloseRequest}
            resetRequest={attachmentResetRequest}
            onModeChange={setAttachmentMode}
            autoFocus={false}
            showSuggestions={false}
            aboveComposer={isEmpty && attachmentMode === 'closed' ? openTasks : null}
            onDockHeightChange={setDockHeight}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  avoider: {
    flex: 1,
  },
  attachmentComposerOverlay: {
    ...StyleSheet.absoluteFill,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  attachmentHeaderBack: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.sm,
    paddingBottom: 220,
  },
  emptyContent: {
    flexGrow: 1,
  },
  cardWrap: {
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  errorText: {
    color: colors.destructive,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  warningText: {
    color: colors.warning,
  },
  openStreamsWrap: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: 0,
  },
  openStreamsState: {
    justifyContent: 'center',
    gap: spacing.xs,
  },
  openStreamsHint: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  openStreamsError: {
    color: colors.destructive,
    fontSize: 13,
    lineHeight: 18,
  },
  openStreamsRetry: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.accentSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  openStreamsRetryText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  openStreamsHeader: {
    color: colors.label,
    fontSize: 15,
    fontWeight: '600',
  },
  openStreamsCarousel: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  openStreamSkeletonPressArea: {
    gap: spacing.xs,
  },
  openStreamSkeletonHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  openStreamSkeletonHeader: {
    width: '64%',
    height: 17,
    borderRadius: 4,
    backgroundColor: colors.separator,
  },
  openStreamSkeletonProjectTotal: {
    width: '32%',
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.accentSurface,
  },
  openStreamSkeletonTask: {
    width: '100%',
    borderRadius: 4,
    backgroundColor: colors.separator,
  },
  openStreamSkeletonFooter: {
    width: 128,
    borderRadius: 12,
    backgroundColor: colors.separator,
    marginTop: spacing.xs,
  },
  openStreamCard: {
    width: 250,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
    overflow: 'hidden',
  },
  openStreamInfoPressArea: {
    borderRadius: 12,
    gap: spacing.xs,
  },
  openStreamProject: {
    lineHeight: 20,
    color: colors.label,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  openStreamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  openStreamTask: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  openStreamProjectTotal: {
    lineHeight: 20,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  openStreamComplete: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.accentSurface,
  },
  openStreamCompleteText: {
    lineHeight: 18,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  confirmWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.66,
    transform: [{ scale: 0.96 }],
  },
});
