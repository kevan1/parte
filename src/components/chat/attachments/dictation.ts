const DICTATION_ERROR_MESSAGES: Record<string, string> = {
  'audio-capture': 'No se pudo acceder al micrófono. Revisá los permisos e intentá nuevamente.',
  busy: 'El micrófono está ocupado. Cerrá otra app que lo esté usando e intentá nuevamente.',
  interrupted: 'El dictado fue interrumpido. Intentá nuevamente.',
  'language-not-supported': 'El idioma de dictado no está disponible en este dispositivo.',
  network: 'No se pudo conectar al servicio de dictado. Revisá tu conexión e intentá nuevamente.',
  'no-speech': 'No detecté voz. Tocá el micrófono y hablá nuevamente.',
  'not-allowed': 'Permití el acceso al micrófono para usar el dictado.',
  'service-not-allowed':
    'El reconocimiento de voz no está disponible. Activá Siri y Dictado en Configuración.',
};

export function mergeDictationText(prefix: string, transcript: string): string {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return prefix;

  const cleanPrefix = prefix.trimEnd();
  if (!cleanPrefix) return cleanTranscript;

  return `${cleanPrefix} ${cleanTranscript}`;
}

export function getDictationErrorMessage(error: string, _nativeMessage?: string): string {
  return DICTATION_ERROR_MESSAGES[error] ?? 'No pudimos completar el dictado. Intentá nuevamente.';
}

export function selectDictationLocale(supportedLocales: string[], preferred = 'es-AR'): string | null {
  if (supportedLocales.length === 0) return preferred;

  const normalizedPreferred = preferred.toLowerCase().replace('_', '-');
  const exactMatch = supportedLocales.find(
    (locale) => locale.toLowerCase().replace('_', '-') === normalizedPreferred,
  );
  if (exactMatch) return exactMatch;

  return (
    supportedLocales.find((locale) => locale.toLowerCase().replace('_', '-').startsWith('es-')) ??
    null
  );
}
