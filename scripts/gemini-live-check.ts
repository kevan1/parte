import { z } from 'zod';

import { generateWithGemini } from '../supabase/functions/_shared/gemini.ts';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const outputSchema = z.object({
  status: z.literal('ready'),
  drafts: z.array(z.object({ durationMinutes: z.number().int() })).min(1),
});

const cases = [
  ['Hoy trabajé hora y media en Horas corrigiendo el login', 90],
  ['Hoy trabajé de 9 a 12 en Horas corrigiendo el login', 180],
] as const;

for (const [content, expectedMinutes] of cases) {
  const output = outputSchema.parse(
    await generateWithGemini({
      apiKey,
      turns: [{ role: 'user', content }],
      recentStreams: [],
      today: '2026-08-13',
    }),
  );
  if (output.drafts[0].durationMinutes !== expectedMinutes) {
    throw new Error(`Unexpected duration for live corpus case: ${content}`);
  }
}

console.log(`Gemini live corpus: PASS (${cases.length} cases)`);
