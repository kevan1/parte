import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Edge Function runtime configuration [AC-9]', () => {
  it('maps shared bare dependencies to pinned Deno-compatible packages', () => {
    const configPath = path.join(
      process.cwd(),
      'supabase/functions/extract-time-entries/deno.json',
    );
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      imports?: Record<string, string>;
    };

    expect(config.imports?.zod).toBe('npm:zod@4.1.12');
  });

  it('invokes native UUID generation with its Crypto receiver intact', () => {
    const entrypoint = readFileSync(
      path.join(process.cwd(), 'supabase/functions/extract-time-entries/index.ts'),
      'utf8',
    );

    expect(entrypoint).toContain('createClientId: () => crypto.randomUUID()');
    expect(entrypoint).not.toContain('createClientId: crypto.randomUUID');
  });
});
