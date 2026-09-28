import { generateWithGemini } from '../../supabase/functions/_shared/gemini';

describe('Gemini structured extraction adapter [AC-4, AC-5, AC-7, AC-9, AC-14]', () => {
  afterEach(() => jest.restoreAllMocks());

  it('pins the approved model and parses only structured JSON output', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      status: 'needs_clarification',
                      question: '¿En qué proyecto trabajaste?',
                      missingFields: ['project'],
                      drafts: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      generateWithGemini({
        apiKey: 'test-only',
        turns: [{ role: 'user', content: 'Trabajé una hora' }],
        recentStreams: [],
        today: '2026-08-13',
      }),
    ).resolves.toMatchObject({ status: 'needs_clarification' });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      contents: [{ role: 'user' }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: expect.any(Object),
      },
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('top_k');
    expect(body.contents[0].parts[0].text).toContain(
      'Conservá el nombre del proyecto tal como lo escribió el usuario',
    );
    expect(body.contents[0].parts[0].text).toContain(
      '“una hora en Horas” significa 60 minutos en el proyecto Horas',
    );
    expect(body.contents[0].parts[0].text).toContain('día feriado');
  });
});
