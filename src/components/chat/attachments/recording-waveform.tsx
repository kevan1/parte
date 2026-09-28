import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, DURATION, EASE_FADE } from './constants';

const BAR_PROFILE = [
  0.18, 0.18, 0.2, 0.22, 0.2, 0.24, 0.25, 0.28, 0.28, 0.3, 0.32, 0.34, 0.38, 0.4,
  0.44, 0.48, 0.52, 0.5, 0.46, 0.42, 0.38, 0.34, 0.3, 0.28, 0.26, 0.56, 0.82, 0.68,
  0.55, 0.72, 0.84, 0.62, 0.56, 0.78, 0.62, 0.52, 0.68, 0.48, 0.34, 0.26, 0.24, 0.2,
  0.18, 0.18, 0.18, 0.18, 0.18,
];

interface RecordingBarProps {
  index: number;
  profile: number;
  reducedMotion: boolean;
}

function RecordingBar({ index, profile, reducedMotion }: RecordingBarProps) {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reducedMotion) {
      pulse.set(withTiming(0.5, { duration: DURATION.crossfade, easing: EASE_FADE }));
      return undefined;
    }

    const low = Math.max(0.24, profile * 0.72);
    const high = Math.min(1, 0.48 + profile * 0.62);
    const middle = Math.min(1, 0.3 + profile * 0.86);

    pulse.set(
      withDelay(
        index * 18,
        withRepeat(
          withSequence(
            withTiming(low, { duration: 220 + (index % 4) * 35, easing: EASE_FADE }),
            withTiming(high, { duration: 180 + (index % 3) * 30, easing: EASE_FADE }),
            withTiming(middle, { duration: 240 + (index % 5) * 24, easing: EASE_FADE }),
          ),
          -1,
          false,
        ),
      ),
    );

    return () => pulse.set(0.5);
  }, [index, profile, pulse, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.get(), [0, 1], [0.58, 1], Extrapolation.CLAMP),
    transform: [{ scaleY: interpolate(pulse.get(), [0, 1], [0.42, 1], Extrapolation.CLAMP) }],
  }));

  return <Animated.View style={[styles.bar, { height: 10 + profile * 20 }, style]} />;
}

export function RecordingWaveform({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return (
    <View testID="attachments-recording-waveform" style={styles.waveform} accessibilityLabel="Grabando">
      {BAR_PROFILE.map((profile, index) => (
        <RecordingBar
          key={`${index}-${profile}`}
          index={index}
          profile={profile}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  waveform: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    overflow: 'hidden',
  },
  bar: {
    width: 3,
    height: 30,
    borderRadius: 1.5,
    backgroundColor: COLORS.recording,
  },
});
