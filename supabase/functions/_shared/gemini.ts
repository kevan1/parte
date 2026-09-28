import { extractionJsonSchema, type RecentStream } from './extraction-core.ts';

type Turn = { role: 'user' | 'assistant'; content: string };

export async function generateWithGemini(input: {
  apiKey: string;
  turns: Turn[];
  recentStreams: RecentStream[];
  today: string;
  signal?: AbortSignal;
}): Promise<unknown> {
  const prompt = [
    'Sos un extractor de partes diarios de trabajo en español argentino.',
    `La fecha actual en America/Argentina/Buenos_Aires es ${input.today}.`,
    'Extraé proyecto, tarea, fecha, minutos, rango opcional y notas.',
    'Si falta proyecto, tarea o duración, devolvé needs_clarification con una sola pregunta breve.',
    'Cada mensaje que comienza con “Respuesta a” incluye la pregunta anterior entre comillas y luego la respuesta explícita. Conservá ese dato en las llamadas siguientes y no vuelvas a pedirlo salvo contradicción.',
    'Si un número entre 0 y 24 responde explícitamente una pregunta de duración y no trae unidad, interpretalo como horas. Los decimales pueden usar coma o punto.',
    'Si el empleado responde “día feriado”, “feriados”, “vacaciones”, “vacación”, “descanso”, “licencia”, “permiso”, “sin trabajo” o “día libre”, consideralo una tarea válida o una nota de contexto, no como rechazo.',
    'Cuando eso ocurra y falte proyecto + tarea, pedí solo el proyecto en una aclaración nueva.',
    'Una descripción de acción como “corrigiendo el login” es una tarea, no un proyecto. Un nombre como “Horas app” puede ser el proyecto.',
    'Conservá el nombre del proyecto tal como lo escribió el usuario; el servidor resolverá alias contra proyectos recientes.',
    'En particular, “una hora en Horas” significa 60 minutos en el proyecto Horas; distinguí la unidad del nombre propio por el contexto y las mayúsculas.',
    'No inventes datos. No aceptes fechas futuras ni rangos que crucen medianoche.',
    'Si hay varias actividades/proyectos, devolvé un draft por cada una.',
    'Un suggestedWorkStreamId solo puede ser uno de los IDs de la lista reciente.',
    `Hilos recientes: ${JSON.stringify(input.recentStreams)}`,
    `Conversación: ${JSON.stringify(input.turns)}`,
  ].join('\n\n');

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': input.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: extractionJsonSchema,
        },
      }),
      signal: input.signal,
    },
  );
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof outputText !== 'string' || outputText.length > 20_000) {
    throw new Error('Gemini response missing output text');
  }
  return JSON.parse(outputText);
}
