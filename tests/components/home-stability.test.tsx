import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CaptureScreen } from '@/screens/capture-screen';

const mockListWorkStreams = jest.fn();
const mockScrollToEnd = jest.fn();
let mockFontScale = 1;
let mockTurns: { role: string; content: string }[] = [];

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return Object.defineProperties(Object.create(native), {
    useWindowDimensions: { value: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }) },
    ScrollView: { value: React.forwardRef(function MockScrollView(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ scrollToEnd: mockScrollToEnd }));
      return React.createElement(native.ScrollView, props);
    }) },
  });
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 100 }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: jest.requireActual('react-native').View,
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
}));
jest.mock('@/state/capture', () => ({
  captureStore: { getState: () => ({ reset: jest.fn() }) },
  useCaptureStore: (selector: (state: object) => unknown) => selector({
    phase: 'idle', turns: mockTurns, drafts: [], failedInput: null, errorMessage: null,
  }),
}));
jest.mock('@/data/time-entry-repository', () => ({ listWorkStreams: () => mockListWorkStreams() }));
jest.mock('@/components/chat/attachments', () => ({
  ChatAttachmentsScreen: ({ aboveComposer, onDockHeightChange }: { aboveComposer?: React.ReactNode; onDockHeightChange?: (height: number) => void }) => {
    const { View } = jest.requireActual('react-native');
    return <View testID="mock-dock" onLayout={(event: { nativeEvent: { layout: { height: number } } }) => onDockHeightChange?.(event.nativeEvent.layout.height)}>{aboveComposer}</View>;
  },
}));
jest.mock('@/components/chat/capture-turn-row', () => ({ CaptureTurnRow: () => null }));
jest.mock('@/components/time-entry/draft-card', () => ({ DraftCard: () => null }));
jest.mock('@/components/navigation/native-capture-header', () => ({ NativeCaptureHeader: () => null }));
jest.mock('@/features/swipe-menu/components/swipe-menu-button', () => ({ SwipeMenuButton: () => null }));
jest.mock('@/components/ui/progressive-blur', () => ({ ProgressiveBlurFooter: () => null }));

const streams = [
  { id: 'short', projectName: 'Horas', taskDescription: 'Desarrollo' },
  { id: 'long', projectName: 'Línea 2', taskDescription: 'Revisar y purgar la válvula de la línea de llenado y ajustar todos los tensores de la banda' },
];

describe('idle home layout stability', () => {
  beforeEach(() => {
    mockFontScale = 1;
    mockTurns = [];
    mockScrollToEnd.mockClear();
    mockListWorkStreams.mockReset();
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1; });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([1, 2])('reserves matching loading and loaded card heights at font scale %s', async (scale) => {
    mockFontScale = scale;
    let finish!: (value: typeof streams) => void;
    mockListWorkStreams.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = await render(<CaptureScreen />);
    const loadingHeight = StyleSheet.flatten(view.getByTestId('open-stream-skeleton-0').props.style).height;
    expect(loadingHeight).toBeGreaterThan(0);
    await act(async () => finish(streams));
    for (const stream of streams) {
      expect(StyleSheet.flatten(view.getByTestId(`open-stream-${stream.id}`).props.style).height).toBe(loadingHeight);
    }
    await fireEvent(view.getByTestId('capture-scroll'), 'contentSizeChange', 390, 1000);
    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });

  it.each(['empty', 'error'])('keeps space when loading resolves to %s', async (outcome) => {
    let finish!: () => void;
    mockListWorkStreams.mockReturnValue(new Promise((resolve, reject) => {
      finish = () => outcome === 'empty' ? resolve([]) : reject(new Error('offline'));
    }));
    const view = await render(<CaptureScreen />);
    const loadingHeight = StyleSheet.flatten(view.getByTestId('open-stream-skeleton-0').props.style).height;
    await act(async () => finish());
    expect(StyleSheet.flatten(view.getByTestId('open-streams-state').props.style).minHeight).toBe(loadingHeight);
  });

  it('does not scroll idle home when loading or examples change content size', async () => {
    mockListWorkStreams.mockResolvedValue(streams);
    const view = await render(<CaptureScreen />);
    await fireEvent(view.getByTestId('capture-scroll'), 'contentSizeChange', 390, 1000);
    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });

  it('keeps conversation updates pinned when already near the bottom', async () => {
    mockTurns = [{ role: 'user', content: 'Trabajé una hora' }];
    mockListWorkStreams.mockResolvedValue([]);
    const view = await render(<CaptureScreen />);
    await fireEvent(view.getByTestId('capture-scroll'), 'contentSizeChange', 390, 1000);
    expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

it('reserves measured dock clearance and keeps home tasks outside the main scroll', async () => {
  mockListWorkStreams.mockResolvedValue(streams);
  const view = await render(<CaptureScreen />);
  const scroll = view.getByTestId('capture-scroll');
  expect(within(scroll).queryByText('Tareas abiertas')).toBeNull();
  expect(within(view.getByTestId('mock-dock')).getByText('Tareas abiertas')).toBeTruthy();
  await fireEvent(view.getByTestId('mock-dock'), 'layout', { nativeEvent: { layout: { height: 280 } } });
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(280 + 34 + 12 + 16);
});

});
