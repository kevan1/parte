-- Development-only rollback companion for the initial, empty-database schema.
-- Never run against production without explicit operator approval.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.update_time_entry(uuid, uuid, boolean, date, integer, time, time, text, text, text);
drop function if exists public.confirm_time_entries(uuid, jsonb);
drop function if exists public.consume_ai_quota();
drop table if exists public.time_entries;
drop table if exists public.work_streams;
drop table if exists public.profiles;
drop table if exists private.ai_user_usage_daily;
drop table if exists private.ai_global_usage_daily;
drop function if exists private.set_updated_at();
drop function if exists private.prevent_identity_change();
drop function if exists private.validate_time_entry();
drop function if exists private.handle_new_user();
drop schema if exists private;
