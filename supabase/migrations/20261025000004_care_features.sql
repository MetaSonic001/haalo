-- Care features: dose tracking + reminders, spoken/photographed vitals, escalation ladder, family messages, appointments,
-- photo proofs, weekly insights. Every table is family-scoped through parent_in_my_family()/is_family_member() (RLS on).

-- ---------------------------------------------------------------- medicines: stock + criticality
alter table public.medicines add column if not exists stock_count int check (stock_count is null or stock_count >= 0);
alter table public.medicines add column if not exists pills_per_dose int not null default 1 check (pills_per_dose > 0);
alter table public.medicines add column if not exists critical boolean not null default false; -- a missed dose escalates to the family
alter table public.medicines add column if not exists purpose text not null default '';

-- ---------------------------------------------------------------- parents: personal health ranges, birthday, photo link token
alter table public.parents add column if not exists vital_ranges jsonb not null default '{}';
alter table public.parents add column if not exists birthday date;
alter table public.parents add column if not exists proof_token text not null default encode(gen_random_bytes(12), 'hex');
create unique index if not exists parents_proof_token_uq on public.parents (proof_token);

-- ---------------------------------------------------------------- doses
create table public.dose_events (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  medicine_id uuid not null references public.medicines (id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'reminded', 'taken', 'missed', 'skipped')),
  confirmed_via text check (confirmed_via in ('call', 'reminder_call', 'inbound', 'photo', 'family', 'manual')),
  confirmed_at timestamptz,
  reminder_attempts int not null default 0,
  last_reminder_at timestamptz,
  call_id uuid references public.calls (id) on delete set null,
  proof_id uuid,
  created_at timestamptz not null default now(),
  unique (medicine_id, due_at)
);
create index on public.dose_events (parent_id, due_at desc);
create index on public.dose_events (status, due_at);

-- ---------------------------------------------------------------- vitals
create table public.vitals (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  kind text not null check (kind in ('bp', 'sugar', 'weight', 'temperature', 'spo2', 'pulse')),
  value numeric not null,           -- systolic for bp
  value2 numeric,                   -- diastolic for bp
  unit text not null default '',
  context text not null default '', -- fasting / after meal / morning ...
  source text not null default 'call' check (source in ('call', 'photo', 'manual')),
  call_id uuid references public.calls (id) on delete set null,
  proof_id uuid,
  flagged boolean not null default false,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.vitals (parent_id, kind, measured_at desc);

-- ---------------------------------------------------------------- contacts + escalation
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  parent_id uuid references public.parents (id) on delete cascade, -- null = applies to every parent in the family
  name text not null,
  relation text not null default '',
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  kind text not null default 'family' check (kind in ('family', 'neighbour', 'doctor', 'other')),
  priority int not null default 1 check (priority between 1 and 9),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.contacts (family_id, priority);

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  trigger text not null check (trigger in ('emergency', 'missed_calls', 'missed_dose', 'manual_test')),
  flag_id uuid references public.flags (id) on delete set null,
  call_id uuid references public.calls (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  summary text not null default '',
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index on public.escalations (parent_id, started_at desc);

create table public.escalation_events (
  id bigint generated always as identity primary key,
  escalation_id uuid not null references public.escalations (id) on delete cascade,
  step int not null default 0,
  channel text not null check (channel in ('family_push', 'call', 'sms')),
  contact_id uuid references public.contacts (id) on delete set null,
  label text not null default '',
  status text not null check (status in ('sent', 'answered', 'no_answer', 'failed', 'acknowledged', 'simulated', 'skipped')),
  detail text not null default '',
  at timestamptz not null default now()
);
create index on public.escalation_events (escalation_id, id);

-- ---------------------------------------------------------------- family -> parent messages
create table public.family_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  from_user_id text references public.profiles (id) on delete set null,
  from_name text not null default '',
  kind text not null default 'note' check (kind in ('note', 'question')),
  body text not null,
  body_local text,                  -- the same message in the parent's language (filled by the voice service)
  status text not null default 'queued' check (status in ('queued', 'delivered', 'answered')),
  delivered_call_id uuid references public.calls (id) on delete set null,
  delivered_at timestamptz,
  reply_text text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.family_messages (parent_id, status, created_at desc);

-- ---------------------------------------------------------------- appointments
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  title text not null,
  doctor text not null default '',
  location text not null default '',
  at timestamptz not null,
  notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  family_reminded boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create index on public.appointments (parent_id, at);

-- ---------------------------------------------------------------- photo proofs
create table public.proofs (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  kind text not null default 'other' check (kind in ('pill', 'bp', 'sugar', 'other')),
  storage_path text,
  extracted jsonb not null default '{}',
  summary text not null default '',
  dose_event_id uuid references public.dose_events (id) on delete set null,
  vital_id uuid references public.vitals (id) on delete set null,
  uploaded_by text not null default 'parent_link',
  created_at timestamptz not null default now()
);
create index on public.proofs (parent_id, created_at desc);

insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false) on conflict do nothing;

-- ---------------------------------------------------------------- insights (weekly trends) + digests
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'watch', 'concern')),
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (parent_id, kind, week_start)
);
create index on public.insights (parent_id, week_start desc);

create table public.weekly_digests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  week_start date not null,
  data jsonb not null,
  summary text not null default '',
  created_at timestamptz not null default now(),
  unique (parent_id, week_start)
);

-- ---------------------------------------------------------------- RLS
alter table public.dose_events enable row level security;
alter table public.vitals enable row level security;
alter table public.contacts enable row level security;
alter table public.escalations enable row level security;
alter table public.escalation_events enable row level security;
alter table public.family_messages enable row level security;
alter table public.appointments enable row level security;
alter table public.proofs enable row level security;
alter table public.insights enable row level security;
alter table public.weekly_digests enable row level security;

create policy dose_events_all on public.dose_events for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy vitals_all on public.vitals for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy contacts_all on public.contacts for all to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy escalations_read on public.escalations for select to authenticated using (public.parent_in_my_family(parent_id));
create policy escalations_update on public.escalations for update to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy escalation_events_read on public.escalation_events for select to authenticated using (
  exists (select 1 from public.escalations e where e.id = escalation_id and public.parent_in_my_family(e.parent_id)));
create policy family_messages_all on public.family_messages for all to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy appointments_all on public.appointments for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy proofs_all on public.proofs for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy insights_read on public.insights for select to authenticated using (public.parent_in_my_family(parent_id));
create policy weekly_digests_read on public.weekly_digests for select to authenticated using (public.parent_in_my_family(parent_id));

-- proofs bucket is read by family members; objects live under "<family_id>/<parent_id>/<file>"
drop policy if exists storage_family_read on storage.objects;
create policy storage_family_read on storage.objects for select to authenticated using (
  bucket_id in ('recordings', 'memory-lane', 'proofs')
  and public.is_family_member(((storage.foldername(name))[1])::uuid));
