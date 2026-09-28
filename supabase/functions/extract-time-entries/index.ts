import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

import {
  ExtractionDependencyError,
  ExtractionError,
  handleExtraction,
} from '../_shared/extraction-core.ts';
import { generateWithGemini } from '../_shared/gemini.ts';
import { createLinkedAbortController } from '../_shared/linked-abort.ts';

const supabaseUrl =
  Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXPO_PUBLIC_SUPABASE_URL');
const publishableKey =
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ??
  Deno.env.get('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

if (!supabaseUrl || !publishableKey || !geminiApiKey) {
  throw new Error('Required server configuration is missing');
}

function isMissingColumnError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return (
    code === '42703' ||
    /column .* does not exist|does not exist|column .* not found/i.test(message)
  );
}

type RecentStreamRow = {
  id: string;
  project_name: string;
  task_description: string;
  created_at: string;
};

async function loadRecentStreams(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  cutoff: string,
  withStatusFilter: boolean,
): Promise<RecentStreamRow[]> {
  const query = supabase
    .from('work_streams')
    .select(
      withStatusFilter
        ? 'id, project_name, task_description, created_at, last_used_at, status'
        : 'id, project_name, task_description, created_at, last_used_at',
    )
    .eq('user_id', userId)
    .gte('last_used_at', cutoff)
    .order('last_used_at', { ascending: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(20);

  const result = withStatusFilter ? await query.eq('status', 'open') : await query;

  if (result.error) throw result.error;
  return (result.data ?? []) as RecentStreamRow[];
}

Deno.serve(async (request) => {
  const authorization = request.headers.get('authorization') ?? '';
  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return handleExtraction(request, {
    authenticate: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new ExtractionError(401, 'UNAUTHORIZED');
      return { id: data.user.id };
    },
    consumeQuota: async () => {
      const { data, error } = await supabase.rpc('consume_ai_quota');
      if (error) throw new Error('quota unavailable');
      return { allowed: Boolean(data?.[0]?.allowed) };
    },
    recentStreams: async (userId) => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000).toISOString();
      let rows: RecentStreamRow[];
      try {
        rows = await loadRecentStreams(supabase, userId, cutoff, true);
      } catch (error) {
        if (!isMissingColumnError(error)) throw new Error('recent streams unavailable');
        rows = await loadRecentStreams(supabase, userId, cutoff, false);
      }
      return rows.map((row) => ({
        id: row.id,
        projectName: row.project_name,
        taskDescription: row.task_description,
        createdAt: row.created_at,
      }));
    },
    dailyMinutes: async (userId, dates) => {
      if (dates.length === 0) return {};
      const { data, error } = await supabase
        .from('time_entries')
        .select('work_date, duration_minutes')
        .eq('user_id', userId)
        .in('work_date', dates);
      if (error) {
        throw new ExtractionDependencyError(`DAILY_MINUTES_${error.code ?? 'UNKNOWN'}`);
      }
      return (data ?? []).reduce<Record<string, number>>((totals, row) => {
        totals[row.work_date] = (totals[row.work_date] ?? 0) + row.duration_minutes;
        return totals;
      }, {});
    },
    generate: async (input) => {
      const linkedAbort = createLinkedAbortController(request.signal, 15_000);
      try {
        return await generateWithGemini({
          apiKey: geminiApiKey,
          ...input,
          signal: linkedAbort.signal,
        });
      } finally {
        linkedAbort.dispose();
      }
    },
    createClientId: () => crypto.randomUUID(),
    reportFailure: ({ stage, kind }) => {
      console.error(JSON.stringify({ event: 'extract_time_entries_failed', stage, kind }));
    },
    today: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
  });
});
