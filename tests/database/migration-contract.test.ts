import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationDirectory = join(process.cwd(), 'supabase', 'migrations');
const migrationFile = readdirSync(migrationDirectory).find((file) =>
  file.endsWith('_create_horas_schema.sql'),
);

if (!migrationFile) throw new Error('Schema migration not found');
const sql = readFileSync(join(migrationDirectory, migrationFile), 'utf8').toLowerCase();
const taskDetailsMigration = readFileSync(
  join(migrationDirectory, '20260831000001_add_task_requester_details.sql'),
  'utf8',
).toLowerCase();
const taskPersistenceMigration = readFileSync(
  join(migrationDirectory, '20260831000002_persist_manual_task_details.sql'),
  'utf8',
).toLowerCase();
const evidenceMigration = readFileSync(
  join(migrationDirectory, '20260831164010_add_work_evidence.sql'),
  'utf8',
).toLowerCase();

describe('initial migration contract [AC-3, AC-7, AC-8, AC-11, AC-13]', () => {
  it.each(['profiles', 'work_streams', 'time_entries'])('enables RLS on %s', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it('does not grant delete or expose a service-role credential', () => {
    expect(sql).not.toMatch(/grant\s+delete/);
    expect(sql).not.toContain('service_role_key');
    expect(sql).not.toContain('gemini_api_key');
  });

  it('uses ownership predicates and immutable user ids', () => {
    expect(sql).toContain('(select auth.uid()) = user_id');
    expect(sql).toContain('profiles_select_own');
    expect(sql).toContain('using ((select auth.uid()) = id)');
    expect(sql).toContain('prevent_identity_change');
  });

  it('confirms drafts atomically with invoker rights and a daily advisory lock', () => {
    expect(sql).toContain('confirm_time_entries');
    expect(sql).toContain('security invoker');
    expect(sql).toContain('pg_advisory_xact_lock');
  });

  it('keeps AI quota state outside the exposed public schema', () => {
    expect(sql).toContain('create schema if not exists private');
    expect(sql).toContain('private.ai_user_usage_daily');
    expect(sql).toContain('private.ai_global_usage_daily');
    expect(sql).toContain('consume_ai_quota');
  });

  it('stores optional requester and materials metadata for assigned tasks', () => {
    expect(taskDetailsMigration).toContain('requester_type text');
    expect(taskDetailsMigration).toContain('requester_name text');
    expect(taskDetailsMigration).toContain("materials jsonb not null default '[]'::jsonb");
    expect(taskDetailsMigration).toContain("'sector', 'line', 'person'");
    expect(taskDetailsMigration).toContain("jsonb_typeof(materials) = 'array'");
  });

  it('persists manual task metadata only when creating a new work stream', () => {
    expect(taskPersistenceMigration).toContain('create or replace function public.confirm_time_entries');
    expect(taskPersistenceMigration).toContain('requester_type');
    expect(taskPersistenceMigration).toContain('requester_name');
    expect(taskPersistenceMigration).toContain('materials');
    expect(taskPersistenceMigration).toContain('if v_stream_id is null then');
  });

  it('protects work evidence with ownership policies and a private bucket', () => {
    expect(evidenceMigration).toContain('create table if not exists public.work_evidence');
    expect(evidenceMigration).toContain('alter table public.work_evidence enable row level security');
    expect(evidenceMigration).toContain('insert into storage.buckets');
    expect(evidenceMigration).toContain("'work-evidence'");
    expect(evidenceMigration).toContain('work_evidence_select_own');
    expect(evidenceMigration).toContain('work_evidence_insert_own');
    expect(evidenceMigration).toContain('storage.foldername(name)');
  });
});
