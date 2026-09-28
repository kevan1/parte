process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const identity = (value: unknown) => value;
  const transition = { duration: () => ({ delay: () => undefined }) };

  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    FadeInDown: { duration: () => undefined },
    FadeInRight: transition,
    FadeIn: { duration: () => undefined },
    FadeOut: { duration: () => undefined },
    LinearTransition: { duration: () => undefined },
    Easing: { out: identity, quad: identity, poly: () => identity },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (value: number, input: number[], output: number[]) => {
      if (value <= input[0]) return output[0];
      if (value >= input[input.length - 1]) return output[output.length - 1];
      for (let index = 1; index < input.length; index += 1) {
        if (value <= input[index]) {
          const ratio = (value - input[index - 1]) / (input[index] - input[index - 1]);
          return output[index - 1] + ratio * (output[index] - output[index - 1]);
        }
      }
      return output[output.length - 1];
    },
    useSharedValue: (initialValue: number) => {
      let value = initialValue;
      return {
        get: () => value,
        set: (nextValue: number) => {
          value = nextValue;
        },
        get value() {
          return value;
        },
        set value(nextValue: number) {
          value = nextValue;
        },
      };
    },
    useAnimatedStyle: (factory: () => object) => factory(),
    useAnimatedReaction: () => undefined,
    useReducedMotion: () => false,
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withDelay: (_delay: number, value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

jest.mock('expo-speech-recognition', () => {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const module = {
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getSupportedLocales: jest.fn(async () => ({
      locales: ['es-AR'],
      installedLocales: ['es-AR'],
    })),
    isRecognitionAvailable: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  };

  return {
    ExpoSpeechRecognitionModule: module,
    useSpeechRecognitionEvent: (name: string, listener: (event: unknown) => void) => {
      const React = require('react');
      React.useEffect(() => {
        listeners[name] = [...(listeners[name] ?? []), listener];
        return () => {
          listeners[name] = (listeners[name] ?? []).filter((candidate) => candidate !== listener);
        };
      }, [name, listener]);
    },
    __emitSpeechRecognitionEvent: (name: string, event: unknown) => {
      for (const listener of listeners[name] ?? []) listener(event);
    },
    __resetSpeechRecognitionMock: () => {
      for (const name of Object.keys(listeners)) delete listeners[name];
      module.requestPermissionsAsync.mockClear();
      module.getSupportedLocales.mockClear();
      module.getSupportedLocales.mockResolvedValue({
        locales: ['es-AR'],
        installedLocales: ['es-AR'],
      });
      module.isRecognitionAvailable.mockClear();
      module.isRecognitionAvailable.mockReturnValue(true);
      module.start.mockClear();
      module.stop.mockClear();
      module.abort.mockClear();
    },
  };
});

jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: () => false,
}));
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: Function, ...args: unknown[]) => callback(...args) }));
