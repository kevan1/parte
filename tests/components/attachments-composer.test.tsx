import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SharedValue } from 'react-native-reanimated';

import { Composer } from '@/components/chat/attachments/composer';

jest.mock('@/components/icon', () => ({ Icon: () => null }));

const speech = jest.requireMock('expo-speech-recognition') as {
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.Mock;
    getSupportedLocales: jest.Mock;
    isRecognitionAvailable: jest.Mock;
    start: jest.Mock;
    stop: jest.Mock;
  };
  __emitSpeechRecognitionEvent: (name: string, event: unknown) => void;
  __resetSpeechRecognitionMock: () => void;
};

function sharedValue(value = 0): SharedValue<number> {
  return { value, get: () => value, set: jest.fn() } as unknown as SharedValue<number>;
}

async function renderComposer(value = '') {
  return render(
    <Composer
      value={value}
      onValueChange={jest.fn()}
      onSend={jest.fn()}
      generating={false}
      onStop={jest.fn()}
      attachments={[]}
      strip={sharedValue()}
      plusOut={sharedValue()}
      pendingIds={[]}
      onPlusPress={jest.fn()}
      onRemove={jest.fn()}
    />,
  );
}

describe('Attachment composer dictation', () => {
  beforeEach(() => {
    speech.__resetSpeechRecognitionMock();
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  it('uses task-oriented copy in the text composer', async () => {
    const view = await renderComposer();

    expect(view.getByPlaceholderText('¿Qué hiciste hoy?')).toBeTruthy();
  });

  it('starts Spanish dictation after permission and forwards interim text', async () => {
    const view = await renderComposer();

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');
    await waitFor(() => expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalled());

    expect(speech.ExpoSpeechRecognitionModule.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: 'es-AR',
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
      }),
    );
  });

  it('uses a supported Spanish fallback when es-AR is unavailable', async () => {
    speech.ExpoSpeechRecognitionModule.getSupportedLocales.mockResolvedValueOnce({
      locales: ['en-US', 'es-ES'],
      installedLocales: ['en-US', 'es-ES'],
    });
    const view = await renderComposer();

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');
    await waitFor(() => expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalled());

    expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'es-ES' }),
    );
  });

  it('keeps dictation stopped and exposes a status when permission is denied', async () => {
    speech.ExpoSpeechRecognitionModule.requestPermissionsAsync.mockResolvedValueOnce({
      granted: false,
    });
    const view = await renderComposer();

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');

    await waitFor(() =>
      expect(view.getByText('Permití el acceso al micrófono para usar el dictado.')).toBeTruthy(),
    );
    expect(speech.ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(view.getByTestId('attachments-dictate').props.accessibilityLabel).toBe('Dictar');
  });

  it('requests permissions before handling a transiently unavailable recognizer', async () => {
    speech.ExpoSpeechRecognitionModule.isRecognitionAvailable.mockReturnValueOnce(false);
    const view = await renderComposer();

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');

    await waitFor(() => expect(speech.ExpoSpeechRecognitionModule.requestPermissionsAsync).toHaveBeenCalled());
    expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalled();
  });

  it('stops from the native control and keeps the existing typed prefix', async () => {
    const onValueChange = jest.fn();
    const view = await render(
      <Composer
        value="En planta"
        onValueChange={onValueChange}
        onSend={jest.fn()}
        generating={false}
        onStop={jest.fn()}
        attachments={[]}
        strip={sharedValue()}
        plusOut={sharedValue()}
        pendingIds={[]}
        onPlusPress={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');
    await waitFor(() => expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalled());
    await act(async () => {
      speech.__emitSpeechRecognitionEvent('start', {});
    });
    await act(async () =>
      speech.__emitSpeechRecognitionEvent('result', {
        isFinal: false,
        results: [{ transcript: 'revisé una válvula' }],
      }),
    );

    expect(onValueChange).toHaveBeenLastCalledWith('En planta revisé una válvula');
    expect(view.getByTestId('attachments-recording-native-stop')).toBeTruthy();

    await fireEvent.press(view.getByTestId('attachments-recording-native-stop'));
    expect(speech.ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
  });

  it('shows a live recording composer with a timer and stop control', async () => {
    const view = await renderComposer();

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');
    expect(view.getByTestId('attachments-recording')).toBeTruthy();
    expect(view.getByTestId('attachments-recording-waveform')).toBeTruthy();
    expect(view.getByTestId('attachments-recording-timer').props.children).toBe('0:00');
    expect(view.getByTestId('attachments-recording').props.style).toEqual(
      expect.objectContaining({ height: 64 }),
    );
    expect(view.getByTestId('attachments-recording').props.style).toEqual(
      expect.objectContaining({
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
      }),
    );
    expect(view.getByTestId('attachments-recording-content').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transformOrigin: 'center bottom',
          transform: [expect.objectContaining({ scaleY: expect.any(Number) })],
        }),
      ]),
    );
    expect(view.getByTestId('attachments-dictate').props.style).toEqual(
      expect.objectContaining({
        position: 'absolute',
        bottom: 0,
        width: 28,
        height: 48,
      }),
    );
    expect(view.getByTestId('attachments-recording-native-stop')).toBeTruthy();
    expect(view.getByTestId('attachments-dictate').props.accessibilityLabel).toBe('Dictar');
    expect(view.getByTestId('attachments-dictate').props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true }),
    );

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(view.getByTestId('attachments-recording-timer').props.children).toBe('0:02');
  });

  it('stops from the recording control', async () => {
    const view = await renderComposer();

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');
    await act(async () => {
      speech.__emitSpeechRecognitionEvent('start', {});
    });
    await fireEvent.press(view.getByTestId('attachments-recording-native-stop'));

    expect(speech.ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
  });

  it('sends the dictated text when the hold is released', async () => {
    const onSend = jest.fn();
    const onValueChange = jest.fn();
    const view = await render(
      <Composer
        value=""
        onValueChange={onValueChange}
        onSend={onSend}
        attachments={[]}
        strip={sharedValue()}
        plusOut={sharedValue()}
        pendingIds={[]}
        onPlusPress={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');
    await waitFor(() => expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalled());
    await act(async () => {
      speech.__emitSpeechRecognitionEvent('start', {});
      speech.__emitSpeechRecognitionEvent('result', {
        isFinal: false,
        results: [{ transcript: 'revisé una válvula' }],
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await fireEvent(view.getByTestId('attachments-dictate'), 'pressOut');
    expect(speech.ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      speech.__emitSpeechRecognitionEvent('end', {});
    });

    expect(onSend).toHaveBeenCalledWith('revisé una válvula');
  });

  it('keeps recording after a quick tap until the native red stop is pressed', async () => {
    const onSend = jest.fn();
    const view = await render(
      <Composer
        value=""
        onValueChange={jest.fn()}
        onSend={onSend}
        attachments={[]}
        strip={sharedValue()}
        plusOut={sharedValue()}
        pendingIds={[]}
        onPlusPress={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressIn');
    await waitFor(() => expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalled());
    await act(async () => {
      speech.__emitSpeechRecognitionEvent('start', {});
      speech.__emitSpeechRecognitionEvent('result', {
        isFinal: false,
        results: [{ transcript: 'mantenimiento preventivo' }],
      });
    });

    await fireEvent(view.getByTestId('attachments-dictate'), 'pressOut');
    expect(speech.ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
    expect(view.getByTestId('attachments-recording')).toBeTruthy();

    await fireEvent.press(view.getByTestId('attachments-recording-native-stop'));
    expect(speech.ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      speech.__emitSpeechRecognitionEvent('end', {});
    });

    expect(onSend).toHaveBeenCalledWith('mantenimiento preventivo');
  });

  it('keeps layout animation on a wrapper separate from thumbnail opacity', async () => {
    const view = await render(
      <Composer
        value=""
        onValueChange={jest.fn()}
        onSend={jest.fn()}
        attachments={[{
          id: 'ph://asset-1',
          fileName: 'tablero.jpg',
          width: 1200,
          height: 900,
          creationTime: null,
        }]}
        strip={sharedValue(1)}
        plusOut={sharedValue()}
        pendingIds={[]}
        onPlusPress={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(view.getByTestId('attachments-attachment-layout').props.style).not.toEqual(
      expect.objectContaining({ opacity: expect.anything() }),
    );
    expect(view.getByTestId('attachments-attachment-content').props.style).not.toEqual(
      expect.objectContaining({ opacity: expect.anything() }),
    );
  });

  it('keeps entering and exiting transitions off fade-content views', async () => {
    const view = await renderComposer();

    expect(view.getByTestId('attachments-normal-content-wrapper').props.style).not.toEqual(
      expect.objectContaining({ opacity: expect.anything() }),
    );
    expect(view.getByTestId('attachments-normal-content').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: expect.any(Number) })]),
    );
  });
});
