import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  getDictationErrorMessage,
  mergeDictationText,
  selectDictationLocale,
} from './dictation';
import { COLORS, COMPOSER, COMPOSER_STRIP_HEIGHT, DURATION, GUTTER } from './constants';
import { Glass } from './glass';
import { RecordingWaveform } from './recording-waveform';
import { RecordingStopButton } from './recording-stop-button';
import type { LibraryPhoto } from './use-photo-library';

const HOLD_RELEASE_THRESHOLD_MS = 300;
const LIGHT_COMPOSER_COLORS = {
  action: '#111111',
  actionGlyph: '#FFFFFF',
  placeholder: '#6C6C70',
  surface: '#F2F2F7',
  text: '#111111',
} as const;

const DARK_COMPOSER_COLORS = {
  action: COLORS.text,
  actionGlyph: COLORS.background,
  placeholder: COLORS.placeholder,
  surface: COLORS.surface,
  text: COLORS.text,
} as const;

interface ThumbnailProps {
  photo: LibraryPhoto;
  /** Held back while a copy of this photo is still flying into this slot. */
  hidden: boolean;
  onRemove: (id: string) => void;
}

function Thumbnail({ photo, hidden, onRemove }: ThumbnailProps) {
  return (
    // No entering animation: the flying copy is still standing in for this
    // slot, and the hand-off has to be a straight swap or the photo
    // double-exposes.
    // Leaving is the opposite — the thumbnail fades where it stands while the
    // ones after it close the gap, which is what `layout` is for.
    <Animated.View
      testID="attachments-attachment-layout"
      exiting={FadeOut.duration(DURATION.crossfade)}
      layout={LinearTransition.duration(DURATION.attach)}
      style={styles.thumb}
    >
      <Animated.View
        testID="attachments-attachment-content"
        style={[StyleSheet.absoluteFill, hidden && styles.thumbHidden]}
      >
        <Image
          source={photo.id}
          recyclingKey={photo.id}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
          hitSlop={10}
          onPress={() => onRemove(photo.id)}
          style={styles.remove}
        >
          <Icon name="close" size={11} color={COLORS.text} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export interface ComposerProps {
  value?: string;
  onValueChange?: (text: string) => void;
  onSend?: (text: string) => void;
  generating?: boolean;
  onStop?: () => void;
  onDictationStateChange?: (active: boolean) => void;
  attachments: LibraryPhoto[];
  /**
   * 0 no strip → 1 strip fully open. Owned by the screen rather than by this
   * component: the panel flying in from the photo grid aims at a slot inside
   * the strip, and that slot is still opening while it flies.
   */
  strip: SharedValue<number>;
  /**
   * 0 the + is in place → 1 it has cleared the space the panel opens on. On the
   * menu's own springs — `SPRING.panel` out, `SPRING.panelOut` back — but not
   * on the menu's clock: it leads the panel in and trails it out, because the
   * panel opens on top of this glyph and would otherwise hide the whole move.
   */
  plusOut: SharedValue<number>;
  /**
   * Ids of the attachments the flight is still standing in for. Every photo
   * picked in one go flies at once, so this is a set and not a single id.
   */
  pendingIds: string[];
  onPlusPress: () => void;
  onRemove: (id: string) => void;
}

/**
 * The chat composer. Its bottom edge is fixed — adding attachments grows it
 * upwards, which is what keeps the + button (and therefore the menu's anchor)
 * from moving. Removing the last one collapses it back down the same way.
 *
 * The bar and the send button are both real glass on iOS 26. The bar is the
 * container and the button is the control, so only the button is interactive —
 * the surface under the text field has no business bulging while it is typed
 * into. Neither clips: the button's rim and its press bulge are drawn outside
 * its bounds, and an `overflow: hidden` on the bar would cut them off.
 */
export const Composer = forwardRef<TextInputType, ComposerProps>(function Composer(
  { value = '', onValueChange, onSend, generating = false, onStop, onDictationStateChange, attachments, strip, plusOut, pendingIds, onPlusPress, onRemove },
  ref,
) {
  const colorScheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const composerColors =
    colorScheme === 'dark' ? DARK_COMPOSER_COLORS : LIGHT_COMPOSER_COLORS;
  const hasAttachments = attachments.length > 0;
  const [dictationState, setDictationState] = useState<'idle' | 'starting' | 'listening'>('idle');
  const [dictationError, setDictationError] = useState<string | null>(null);
  const dictationBase = useRef(value);
  const dictationText = useRef(value);
  const dictationRequest = useRef(0);
  const dictationActiveRef = useRef(false);
  const dictationStateRef = useRef<'idle' | 'starting' | 'listening'>('idle');
  const autoSendOnRelease = useRef(false);
  const releaseHandled = useRef(false);
  const dictationPressedAt = useRef(0);
  const dictationActive = dictationState !== 'idle';
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const recordingExpansion = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const setDictationStatus = useCallback((nextState: 'idle' | 'starting' | 'listening') => {
    dictationStateRef.current = nextState;
    dictationActiveRef.current = nextState !== 'idle';
    if (nextState === 'starting') setRecordingElapsedSeconds(0);
    setDictationState(nextState);
    onDictationStateChange?.(nextState !== 'idle');
  }, [onDictationStateChange]);

  useSpeechRecognitionEvent('start', () => {
    setDictationStatus('listening');
  });

  useSpeechRecognitionEvent('end', () => {
    const shouldSend = autoSendOnRelease.current;
    const transcript = dictationText.current.trim();
    autoSendOnRelease.current = false;
    setDictationStatus('idle');
    if (shouldSend && transcript) onSend?.(transcript);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (!transcript) return;
    const mergedText = mergeDictationText(dictationBase.current, transcript);
    dictationText.current = mergedText;
    onValueChange?.(mergedText);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setDictationStatus('idle');
    setDictationError(getDictationErrorMessage(event.error, event.message));
  });

  useEffect(() => {
    recordingExpansion.set(
      withTiming(dictationActive ? 1 : 0, { duration: DURATION.crossfade }),
    );
  }, [dictationActive, recordingExpansion]);

  useEffect(() => {
    if (!dictationActive) return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRecordingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [dictationActive]);

  useEffect(() => {
    if (dictationState === 'idle') {
      dictationBase.current = value;
      dictationText.current = value;
    }
  }, [dictationState, value]);

  useEffect(() => () => {
    if (dictationActiveRef.current) ExpoSpeechRecognitionModule.abort();
  }, []);

  const handleDictationPressIn = useCallback(async () => {
    if (dictationStateRef.current !== 'idle') return;
    releaseHandled.current = false;
    autoSendOnRelease.current = false;
    dictationPressedAt.current = Date.now();
    const requestId = ++dictationRequest.current;
    dictationBase.current = value;
    dictationText.current = value;
    setDictationError(null);
    setDictationStatus('starting');

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted || requestId !== dictationRequest.current) {
        if (requestId === dictationRequest.current) {
          setDictationStatus('idle');
          setDictationError('Permití el acceso al micrófono para usar el dictado.');
        }
        return;
      }

      const supportedLocales = await ExpoSpeechRecognitionModule.getSupportedLocales({});
      const locale = selectDictationLocale(supportedLocales.locales);
      if (!locale || requestId !== dictationRequest.current) {
        if (requestId === dictationRequest.current) {
          setDictationStatus('idle');
          setDictationError(getDictationErrorMessage('language-not-supported'));
        }
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        contextualStrings: ['horas', 'tarea', 'proyecto', 'válvula', 'mantenimiento', 'revisé'],
      });
    } catch {
      if (requestId !== dictationRequest.current) return;
      setDictationStatus('idle');
      setDictationError('No pudimos iniciar el dictado. Intentá nuevamente.');
    }
  }, [setDictationStatus, value]);

  const finalizeDictation = useCallback(() => {
    if (releaseHandled.current || dictationStateRef.current === 'idle') return;
    releaseHandled.current = true;
    dictationRequest.current += 1;

    if (dictationStateRef.current === 'starting') {
      setDictationStatus('idle');
      return;
    }

    autoSendOnRelease.current = true;
    ExpoSpeechRecognitionModule.stop();
  }, [setDictationStatus]);

  const handleDictationPressOut = useCallback(() => {
    if (Date.now() - dictationPressedAt.current < HOLD_RELEASE_THRESHOLD_MS) return;
    finalizeDictation();
  }, [finalizeDictation]);

  const handleInputChange = useCallback((nextValue: string) => {
    setDictationError(null);
    if (!dictationActive) dictationBase.current = nextValue;
    onValueChange?.(nextValue);
  }, [dictationActive, onValueChange]);

  /**
   * The + hands its place over to the menu about to grow out of it: right and
   * out, and back the same way once the menu has gone.
   *
   * Only the glyph moves. The hit target stays where it is, so the second tap —
   * the one that dismisses — lands on the same spot as the first.
   *
   * The slide takes the spring raw, overshoot and all, because that overshoot
   * is the whole character of the move. The fade is clamped, since `withSpring`
   * settles past 1 and a raw `1 - plusOut` would drive opacity negative.
   *
   * It runs to 0.75 rather than to the halfway point so the + is still on its
   * way out when the panel lands on it, instead of leaving a beat where the
   * composer holds an empty slot and nothing is moving at all. The last of the
   * fade happens underneath the panel, which costs nothing to draw.
   */
  const plusStyle = useAnimatedStyle(() => ({
    opacity: interpolate(plusOut.get(), [0, 0.75], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: plusOut.get() * COMPOSER.plusSlide }],
  }));

  /**
   * The strip has to outlive its last attachment. `attachments` empties on the
   * tap, but the strip spends the next third of a second closing, and an empty
   * strip has nothing left in it to shrink away.
   */
  const [retained, setRetained] = useState(attachments);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasAttachments) setRetained(attachments);
  }, [attachments, hasAttachments]);

  // Dropped once the strip is shut, not before: a spring lands exactly on its
  // target, so `=== 0` is the moment it is safe to unmount the photos.
  useAnimatedReaction(
    () => strip.get() === 0,
    (shut, wasShut) => {
      if (shut && wasShut === false) scheduleOnRN(setRetained, [] as LibraryPhoto[]);
    },
  );

  /**
   * The strip's own height, clipped. Its contents keep their full size and are
   * anchored to its top, so the photos rise out of the text row as it opens and
   * slide back down into it as it closes rather than squashing.
   */
  const stripStyle = useAnimatedStyle(() => ({
    height: strip.get() * COMPOSER_STRIP_HEIGHT,
  }));

  const recordingExpansionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      recordingExpansion.get(),
      [0, 0.18, 1],
      [0, 1, 1],
      Extrapolation.CLAMP,
    ),
    transformOrigin: 'center bottom',
    transform: [
      {
        scaleY: interpolate(
          recordingExpansion.get(),
          [0, 1],
          [0.16, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const normalContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      recordingExpansion.get(),
      [0, 0.18, 1],
      [1, 0, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const micGlyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      recordingExpansion.get(),
      [0, 0.18, 1],
      [1, 0, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Glass
      radius={dictationActive ? COMPOSER.recordingHeight / 2 : COMPOSER.radius}
      interactive={false}
      colorScheme={colorScheme}
      // Below iOS 26 the bar keeps the flat surface it was measured at.
      fallbackTint={composerColors.surface}
      style={styles.root}
    >
      <Animated.View style={[styles.strip, stripStyle]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          style={styles.stripScroll}
          contentContainerStyle={styles.stripContent}
        >
          {retained.map((photo) => (
            <Thumbnail
              key={photo.id}
              photo={photo}
              hidden={pendingIds.includes(photo.id)}
              onRemove={onRemove}
            />
          ))}
        </ScrollView>
      </Animated.View>

      <Animated.View
        layout={LinearTransition.duration(DURATION.crossfade)}
        style={[styles.row, dictationActive && styles.recordingContainer]}
      >
        <Animated.View
          testID="attachments-normal-content-wrapper"
          entering={FadeIn.duration(DURATION.crossfade)}
          exiting={FadeOut.duration(DURATION.crossfade)}
          pointerEvents={dictationActive ? 'none' : 'auto'}
          style={styles.rowContent}
        >
          <Animated.View testID="attachments-normal-content" style={[styles.rowContent, normalContentStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add attachment"
              hitSlop={12}
              onPress={onPlusPress}
              style={styles.plus}
            >
              <Animated.View style={plusStyle}>
                <Icon name="plus" size={COMPOSER.plusSize} color={composerColors.text} />
              </Animated.View>
            </Pressable>

            <TextInput
              ref={ref}
              value={value}
              onChangeText={handleInputChange}
              placeholder="¿Qué hiciste hoy?"
              placeholderTextColor={composerColors.placeholder}
              keyboardAppearance={colorScheme}
              multiline={false}
              style={[styles.field, { color: composerColors.text }]}
            />

            <View style={styles.micButton} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={generating ? 'Stop' : hasAttachments || value.trim() ? 'Send' : 'Voice mode'}
              onPress={() => {
                if (generating) onStop?.();
                else if (value.trim()) onSend?.(value.trim());
              }}
              style={[styles.action, { backgroundColor: composerColors.action }]}
            >
              <Icon
                name={generating ? 'close' : hasAttachments || value.trim() ? 'arrow-up' : 'audio-lines'}
                size={18}
                color={composerColors.actionGlyph}
              />
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/**
         * This responder never changes bounds while a recording is starting.
         * Keeping it mounted is important: changing it from the small mic hit
         * target into the full-width recording row is what caused the old
         * transition to expand sideways and made press-out unreliable.
         */}
        <Pressable
          testID="attachments-dictate"
          accessibilityRole="button"
          accessibilityLabel="Dictar"
          accessibilityState={{ busy: dictationState === 'starting' }}
          hitSlop={10}
          onPressIn={handleDictationPressIn}
          onPressOut={handleDictationPressOut}
          style={styles.dictationGesture}
        >
          <Animated.View style={[styles.micGlyph, micGlyphStyle]}>
            <Icon name="mic" size={COMPOSER.micSize} color={composerColors.text} />
          </Animated.View>
        </Pressable>

        {dictationActive ? (
          <Animated.View
            testID="attachments-recording"
            pointerEvents="box-none"
            entering={FadeIn.duration(DURATION.crossfade)}
            exiting={FadeOut.duration(DURATION.crossfade)}
            style={styles.recordingRow}
          >
            <Animated.View
              testID="attachments-recording-content"
              pointerEvents="box-none"
              style={[styles.recordingContent, recordingExpansionStyle]}
            >
              <RecordingWaveform reducedMotion={Boolean(reduceMotion)} />
              <Text testID="attachments-recording-timer" style={styles.recordingTimer}>
                {formatRecordingTime(recordingElapsedSeconds)}
              </Text>
              <RecordingStopButton onPress={finalizeDictation} />
            </Animated.View>
          </Animated.View>
        ) : null}
      </Animated.View>
      {dictationError ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.dictationStatus, { color: composerColors.text }]}
        >
          {dictationError}
        </Text>
      ) : null}
    </Glass>
  );
});

const styles = StyleSheet.create({
  root: {
    marginHorizontal: GUTTER,
    position: 'relative',
  },
  strip: {
    // The clip the bar used to carry. It lives here instead so no glass sits
    // under an `overflow: hidden`; the radius is the bar's own, pulled in by
    // the strip's inset so the two curves stay concentric. It is also what
    // makes the height animate: the photos are cut off by it, never scaled.
    overflow: 'hidden',
    borderTopLeftRadius: COMPOSER.radius - COMPOSER.stripPaddingTop,
    borderTopRightRadius: COMPOSER.radius - COMPOSER.stripPaddingTop,
    borderCurve: 'continuous',
  },
  stripScroll: {
    // Pinned to the top of the clip at its full open height, so a half-open
    // strip shows the top of the photos rather than a squashed copy of them.
    position: 'absolute',
    left: 0,
    right: 0,
    top: COMPOSER.stripPaddingTop,
    height: COMPOSER.thumbSize,
  },
  stripContent: {
    paddingLeft: COMPOSER.stripPaddingTop,
    gap: COMPOSER.thumbGap,
  },
  thumb: {
    width: COMPOSER.thumbSize,
    height: COMPOSER.thumbSize,
    borderRadius: COMPOSER.thumbRadius,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: '#141414',
  },
  thumbHidden: {
    opacity: 0,
  },
  row: {
    height: COMPOSER.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    // Shared with the panel: these two put the + glyph's centre at
    // `PLUS_CENTER_X`, which is where the menu grows out of.
    paddingLeft: COMPOSER.rowPaddingLeft,
    paddingRight: 9,
    gap: 10,
  },
  rowContent: {
    flex: 1,
    height: COMPOSER.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingContainer: {
    height: COMPOSER.recordingHeight,
  },
  plus: {
    width: COMPOSER.plusHit,
    alignItems: 'center',
  },
  field: {
    flex: 1,
    fontSize: COMPOSER.fieldSize,
    padding: 0,
  },
  micButton: {
    width: COMPOSER.micSize + 8,
    height: COMPOSER.rowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: COMPOSER.recordingHeight,
  },
  recordingContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    paddingRight: 7,
    gap: 12,
  },
  dictationGesture: {
    position: 'absolute',
    right: 9 + COMPOSER.actionSize,
    bottom: 0,
    width: COMPOSER.micSize + 8,
    height: COMPOSER.rowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingTimer: {
    width: 43,
    color: COLORS.recording,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  remove: {
    position: 'absolute',
    top: COMPOSER.removeBadgeInset,
    right: COMPOSER.removeBadgeInset,
    width: COMPOSER.removeBadge,
    height: COMPOSER.removeBadge,
    borderRadius: COMPOSER.removeBadge / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dictationStatus: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: COMPOSER.rowHeight + 8,
    fontSize: 12,
    textAlign: 'center',
  },
  action: {
    // Solid white, not glass: it is the one control in the bar that has to read
    // as the primary action, and a material takes its contrast from whatever it
    // happens to be sitting over.
    width: COMPOSER.actionSize,
    height: COMPOSER.actionSize,
    borderRadius: COMPOSER.actionSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
