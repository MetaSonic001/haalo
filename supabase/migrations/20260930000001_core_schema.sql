-- Haalo core schema. Apply to a HOSTED Supabase project (no Docker): `supabase db push`.
-- RLS is enabled on every table. The voice service uses the service-role key (bypasses RLS) server-side only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
$$;

-- ---------------------------------------------------------------- profiles / families
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  app_language text not null default 'en',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free_pilot',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  alert_prefs jsonb not null default '{"emergency": true, "summary": true, "missed": true}',
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index on public.family_members (user_id);

create or replace function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = auth.uid())
$$;

create or replace function public.is_family_owner(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members m
                 where m.family_id = fid and m.user_id = auth.uid() and m.role = 'owner')
$$;

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  role text not null default 'member' check (role in ('owner', 'member')),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- parents
create table public.parents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  language text not null default 'mr',
  dialect text not null default '',
  honorific text not null default '',
  child_name text not null default '',
  call_timezone text not null default 'Asia/Kolkata',
  voice_gender text not null default 'female' check (voice_gender in ('female', 'male')),
  pace numeric not null default 0.9 check (pace between 0.6 and 1.3),
  silence_ms int not null default 1000 check (silence_ms between 400 and 3000),
  consent_status text not null default 'pending' check (consent_status in ('pending', 'granted', 'declined')),
  consent_at timestamptz,
  consent_call_id uuid,
  recording_consent boolean not null default false,
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.parents (family_id);
create index on public.parents (phone_e164);

create table public.parent_context (
  parent_id uuid primary key references public.parents (id) on delete cascade,
  interests text[] not null default '{}',
  family_names jsonb not null default '{}',
  doctor_names text[] not null default '{}',
  vocab text[] not null default '{}'
);

create table public.medicines (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  name text not null,
  dose_text text not null default '',
  times text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.medicines (parent_id);

create table public.call_schedules (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null unique references public.parents (id) on delete cascade,
  days_of_week int[] not null default '{0,1,2,3,4,5,6}', -- 0 = Sunday
  window_start time not null default '09:00',
  window_end time not null default '10:30',
  paused_until timestamptz,
  skip_next_date date,
  active boolean not null default true
);

-- ---------------------------------------------------------------- calls
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.parents (id) on delete cascade,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  status text not null default 'queued' check (status in
    ('queued', 'dialing', 'in_progress', 'completed', 'no_answer', 'no_response', 'failed', 'missed')),
  scheduled_for timestamptz,
  next_attempt_at timestamptz,
  attempt int not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  duration_s int,
  provider text,
  provider_call_id text,
  language text,
  stt_provider text,
  tts_provider text,
  llm_model text,
  persona_version text,
  latency_p50_ms int,
  latency_p95_ms int,
  cost_breakdown jsonb not null default '{}',
  recording_path text,
  end_reason text,
  is_consent_call boolean not null default false,
  error_code text,
  block_reason text,
  error_detail text,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.calls (parent_id, created_at desc);
create index on public.calls (status, coalesce(next_attempt_at, scheduled_for));
create unique index calls_provider_call_id_uq on public.calls (provider, provider_call_id) where provider_call_id is not null;

create table public.call_turns (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.calls (id) on delete cascade,
  speaker text not null check (speaker in ('parent', 'agent')),
  text text not null,
  started_ms int,
  ended_ms int,
  stt_confidence real,
  latency_ms int,
  corrected_text text
);
create index on public.call_turns (call_id, id);

create table public.call_summaries (
  call_id uuid primary key references public.calls (id) on delete cascade,
  data jsonb not null,
  summary_for_family text not null default '',
  mood text,
  model text,
  created_at timestamptz not null default now()
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references public.calls (id) on delete set null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  category text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'emergency')),
  evidence_quote text not null default '',
  source text not null default 'model',
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.flags (parent_id, status, created_at desc);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  fact text not null,
  fact_key text not null, -- normalised fact for dedupe
  source_call_id uuid references public.calls (id) on delete set null,
  pinned boolean not null default false,
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (parent_id, fact_key)
);
-- Optional semantic search later: create extension vector; alter table memories add column embedding vector(384);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  text text not null,
  due_date date,
  source_call_id uuid references public.calls (id) on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.follow_ups (parent_id, done);

create table public.memory_lane (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  call_id uuid references public.calls (id) on delete set null,
  title text not null,
  audio_path text,
  transcript text not null default '',
  share_consent boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- notifications / push
create table public.push_tokens (
  expo_token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'unknown',
  created_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid references public.families (id) on delete cascade,
  kind text not null, -- summary | flag | missed | consent
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- ops
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  phone text,
  city text,
  parent_language text,
  source text,
  utm jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'
);

create table public.call_reviews (
  call_id uuid primary key references public.calls (id) on delete cascade,
  reviewer uuid references auth.users (id) on delete set null,
  rating int check (rating between 1 and 5),
  tags text[] not null default '{}',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config (key, value) values ('recording_retention_days', '30') on conflict do nothing;

-- ---------------------------------------------------------------- new-user hook
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- family bootstrap + invites (RPC)
create or replace function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into families (name, created_by) values (p_name, auth.uid()) returning id into fid;
  insert into family_members (family_id, user_id, role) values (fid, auth.uid(), 'owner');
  return fid;
end $$;

create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv family_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from family_invites
   where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'invite invalid or expired'; end if;
  insert into family_members (family_id, user_id, role) values (inv.family_id, auth.uid(), inv.role)
    on conflict do nothing;
  update family_invites set accepted_by = auth.uid(), accepted_at = now() where id = inv.id;
  return inv.family_id;
end $$;

-- ---------------------------------------------------------------- scheduler (called by the voice worker / pg_cron)
create or replace function public.enqueue_due_calls() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; local_now timestamp; local_date date; due timestamptz;
begin
  for r in
    select s.*, p.call_timezone as tz, p.consent_status
      from call_schedules s join parents p on p.id = s.parent_id
     where s.active and p.consent_status <> 'declined'
  loop
    local_now := now() at time zone r.tz;
    local_date := local_now::date;
    if r.paused_until is not null and r.paused_until > now() then continue; end if;
    if r.skip_next_date is not null and r.skip_next_date = local_date then continue; end if;
    if not (extract(dow from local_now)::int = any (r.days_of_week)) then continue; end if;
    if local_now::time < r.window_start or local_now::time > r.window_end then continue; end if;
    due := (local_date + r.window_start) at time zone r.tz;
    if exists (select 1 from calls c where c.parent_id = r.parent_id and c.direction = 'outbound'
                and (c.scheduled_for at time zone r.tz)::date = local_date) then continue; end if;
    insert into calls (parent_id, direction, status, scheduled_for, is_consent_call)
    values (r.parent_id, 'outbound', 'queued', due, r.consent_status = 'pending');
    n := n + 1;
  end loop;
  -- clear a one-off skip once its day has passed
  update call_schedules s set skip_next_date = null
   where skip_next_date is not null and skip_next_date < (now() at time zone 'UTC')::date - 1;
  return n;
end $$;

create or replace function public.claim_due_calls(p_limit int default 5) returns setof public.calls
language plpgsql security definer set search_path = public as $$
begin
  return query
  update calls c set status = 'dialing', attempt = c.attempt + 1
   where c.id in (
     select id from calls
      where status = 'queued' and coalesce(next_attempt_at, scheduled_for) <= now()
      order by coalesce(next_attempt_at, scheduled_for)
      limit p_limit for update skip locked)
  returning c.*;
end $$;

revoke all on function public.enqueue_due_calls() from public, anon, authenticated;
revoke all on function public.claim_due_calls(int) from public, anon, authenticated;
grant execute on function public.enqueue_due_calls() to service_role;
grant execute on function public.claim_due_calls(int) to service_role;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.parents enable row level security;
alter table public.parent_context enable row level security;
alter table public.medicines enable row level security;
alter table public.call_schedules enable row level security;
alter table public.calls enable row level security;
alter table public.call_turns enable row level security;
alter table public.call_summaries enable row level security;
alter table public.flags enable row level security;
alter table public.memories enable row level security;
alter table public.follow_ups enable row level security;
alter table public.memory_lane enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;
alter table public.waitlist enable row level security;
alter table public.audit_log enable row level security;
alter table public.call_reviews enable row level security;
alter table public.app_config enable row level security;

-- profiles: own row; family members can see each other's names
create policy profiles_self on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_family_read on public.profiles for select to authenticated using (
  exists (select 1 from public.family_members a join public.family_members b on a.family_id = b.family_id
           where a.user_id = auth.uid() and b.user_id = profiles.id));

-- families
create policy families_member_read on public.families for select to authenticated using (public.is_family_member(id));
create policy families_owner_update on public.families for update to authenticated
  using (public.is_family_owner(id)) with check (public.is_family_owner(id));
create policy families_owner_delete on public.families for delete to authenticated using (public.is_family_owner(id));

-- family_members: read within family; owner manages; a member may edit own prefs / leave
create policy fm_read on public.family_members for select to authenticated using (public.is_family_member(family_id));
create policy fm_owner_manage on public.family_members for all to authenticated
  using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));
create or replace function public.my_family_role(fid uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.family_members m where m.family_id = fid and m.user_id = auth.uid()
$$;
-- a member may change their own alert prefs but never their own role
create policy fm_self_update on public.family_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and role = public.my_family_role(family_id));
create policy fm_self_delete on public.family_members for delete to authenticated using (user_id = auth.uid());

create policy invites_owner on public.family_invites for all to authenticated
  using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));

-- parents and everything hanging off a parent: family members read/write
create or replace function public.parent_in_my_family(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parents p join public.family_members m on m.family_id = p.family_id
                  where p.id = pid and m.user_id = auth.uid())
$$;

create policy parents_all on public.parents for all to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy parent_context_all on public.parent_context for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy medicines_all on public.medicines for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy schedules_all on public.call_schedules for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
-- calls/turns/summaries are written by the voice service; family may read, and request an on-demand call (insert queued)
create policy calls_read on public.calls for select to authenticated using (public.parent_in_my_family(parent_id));
create policy calls_request on public.calls for insert to authenticated
  with check (public.parent_in_my_family(parent_id) and status = 'queued' and direction = 'outbound' and scheduled_for is not null and demo = false);
create policy turns_read on public.call_turns for select to authenticated using (
  exists (select 1 from public.calls c where c.id = call_id and public.parent_in_my_family(c.parent_id)));
create policy summaries_read on public.call_summaries for select to authenticated using (
  exists (select 1 from public.calls c where c.id = call_id and public.parent_in_my_family(c.parent_id)));
create policy flags_read on public.flags for select to authenticated using (public.parent_in_my_family(parent_id));
create policy flags_update on public.flags for update to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy memories_all on public.memories for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy follow_ups_all on public.follow_ups for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy memory_lane_all on public.memory_lane for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));

-- own push tokens / notifications
create policy push_tokens_self on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_self on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_self_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- admin claim: read everything needed for /admin; QA reviews writable
create policy admin_calls on public.calls for select to authenticated using (public.is_admin());
create policy admin_turns on public.call_turns for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_summaries on public.call_summaries for select to authenticated using (public.is_admin());
create policy admin_flags on public.flags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_parents on public.parents for select to authenticated using (public.is_admin());
create policy admin_waitlist on public.waitlist for select to authenticated using (public.is_admin());
create policy admin_audit on public.audit_log for select to authenticated using (public.is_admin());
create policy admin_reviews on public.call_reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_config on public.app_config for select to authenticated using (public.is_admin());
-- waitlist inserts happen via a server route with the service role; no anon policy on purpose.

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.calls, public.flags, public.notifications;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values ('recordings', 'recordings', false), ('memory-lane', 'memory-lane', false)
  on conflict do nothing;

-- objects are stored under "<family_id>/<...>"; family members may read, service role writes.
create policy storage_family_read on storage.objects for select to authenticated using (
  bucket_id in ('recordings', 'memory-lane')
  and public.is_family_member(((storage.foldername(name))[1])::uuid));
