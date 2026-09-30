-- Transcript translations, recording retention, daily digest storage.

alter table public.call_turns add column if not exists translated_text text;

-- Family members may ask for a translation to be stored on their family's turns (the voice/web server writes it with the service role;
-- this column is read through the existing turns_read policy).

create table if not exists public.daily_digests (
  day date primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.daily_digests enable row level security;
create policy admin_digests on public.daily_digests for select to authenticated using (public.is_admin());

-- Recording retention: delete recordings older than app_config.recording_retention_days.
-- Object rows are removed here; the storage API purges the underlying files (Supabase deletes objects when rows are removed via the API,
-- so the voice service's daily retention task also calls storage.remove for the same paths).
create or replace function public.expired_recordings() returns table (call_id uuid, recording_path text)
language sql security definer set search_path = public as $$
  select c.id, c.recording_path
    from calls c
   where c.recording_path is not null
     and c.ended_at < now() - make_interval(days => coalesce((select (value)::int from app_config where key = 'recording_retention_days'), 30))
$$;
revoke all on function public.expired_recordings() from public, anon, authenticated;
grant execute on function public.expired_recordings() to service_role;

-- pg_cron (available on hosted Supabase): enqueue due calls every minute as a belt-and-braces to the worker's own poll.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('haalo-enqueue-due-calls', '* * * * *', $cron$select public.enqueue_due_calls()$cron$);
  end if;
exception when others then
  raise notice 'pg_cron not enabled (%). The voice worker enqueues due calls itself.', sqlerrm;
end $$;
