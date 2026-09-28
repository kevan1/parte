import {
  getDictationErrorMessage,
  mergeDictationText,
  selectDictationLocale,
} from '@/components/chat/attachments/dictation';

describe('dictation transcript merging', () => {
  it('uses the transcript directly when the input is empty', () => {
    expect(mergeDictationText('', '  Revisé una válvula  ')).toBe('Revisé una válvula');
  });

  it('preserves typed text as a prefix', () => {
    expect(mergeDictationText('En planta', 'revisé una válvula')).toBe(
      'En planta revisé una válvula',
    );
  });

  it('does not duplicate a prefix that already ends with whitespace', () => {
    expect(mergeDictationText('En planta: ', 'revisé una válvula')).toBe(
      'En planta: revisé una válvula',
    );
  });

  it('keeps the original input when recognition returns an empty interim result', () => {
    expect(mergeDictationText('En planta', '   ')).toBe('En planta');
  });

  it('explains when the recognizer did not hear speech', () => {
    expect(getDictationErrorMessage('no-speech', 'Failed to recognize any speech')).toBe(
      'No detecté voz. Tocá el micrófono y hablá nuevamente.',
    );
  });

  it('explains when the device speech service is unavailable', () => {
    expect(getDictationErrorMessage('service-not-allowed', 'Recognizer is unavailable')).toBe(
      'El reconocimiento de voz no está disponible. Activá Siri y Dictado en Configuración.',
    );
  });

  it('prefers the regional Spanish locale and falls back to another Spanish locale', () => {
    expect(selectDictationLocale(['en-US', 'es-ES', 'es-MX'])).toBe('es-ES');
    expect(selectDictationLocale(['en-US', 'es-AR', 'es-ES'])).toBe('es-AR');
  });

  it('returns no locale when the device has no Spanish recognizer', () => {
    expect(selectDictationLocale(['en-US', 'fr-FR'])).toBeNull();
  });
});
