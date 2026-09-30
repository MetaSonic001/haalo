-- Auth moves from Supabase Auth (uuid) to Clerk (text ids like "user_2abc..."), connected as a Supabase third-party auth provider.
-- Clerk session tokens carry the user id in the `sub` claim. It is NOT a uuid, so every user reference becomes text and
-- every policy reads the user via public.requesting_user_id() instead of auth.uid().

create or replace function public.requesting_user_id() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- Policies reference the columns and functions being changed, so drop them all and recreate below.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  execute 'drop policy if exists storage_family_read on storage.objects';
end $$;

-- Foreign keys to auth.users no longer make sense.
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname from pg_constraint
     where contype = 'f' and confrelid = 'auth.users'::regclass and connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.profiles alter column id type text using id::text;
alter table public.profiles alter column id drop default;
alter table public.families alter column created_by type text using created_by::text;
alter table public.family_members alter column user_id type text using user_id::text;
alter table public.family_invites alter column created_by type text using created_by::text;
alter table public.family_invites alter column accepted_by type text using accepted_by::text;
alter table public.parents alter column created_by type text using created_by::text;
alter table public.flags alter column acknowledged_by type text using acknowledged_by::text;
alter table public.push_tokens alter column user_id type text using user_id::text;
alter table public.notifications alter column user_id type text using user_id::text;
alter table public.call_reviews alter column reviewer type text using reviewer::text;
alter table public.audit_log alter column actor type text using actor::text;

-- Members, push tokens and notifications belong to a profile (this also lets PostgREST embed profiles(full_name)).
alter table public.family_members add constraint family_members_user_fk foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.push_tokens add constraint push_tokens_user_fk foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.notifications add constraint notifications_user_fk foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin() returns boolean
language sql stable as $$
  -- Set in Clerk: session token claims {"app_metadata": {"is_admin": "{{user.public_metadata.is_admin}}"}}
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
$$;

create or replace function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = public.requesting_user_id())
$$;

create or replace function public.is_family_owner(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members m
                 where m.family_id = fid and m.user_id = public.requesting_user_id() and m.role = 'owner')
$$;

create or replace function public.my_family_role(fid uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.family_members m where m.family_id = fid and m.user_id = public.requesting_user_id()
$$;

create or replace function public.parent_in_my_family(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parents p join public.family_members m on m.family_id = p.family_id
                  where p.id = pid and m.user_id = public.requesting_user_id())
$$;

create or replace function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid; uid text := public.requesting_user_id();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into profiles (id) values (uid) on conflict do nothing;
  insert into families (name, created_by) values (p_name, uid) returning id into fid;
  insert into family_members (family_id, user_id, role) values (fid, uid, 'owner');
  return fid;
end $$;

create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv family_invites; uid text := public.requesting_user_id();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from family_invites
   where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'invite invalid or expired'; end if;
  insert into profiles (id) values (uid) on conflict do nothing;
  insert into family_members (family_id, user_id, role) values (inv.family_id, uid, inv.role) on conflict do nothing;
  update family_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.family_id;
end $$;

-- ---------------------------------------------------------------- policies (same rules as before, keyed on requesting_user_id())
create policy profiles_self on public.profiles for all to authenticated
  using (id = public.requesting_user_id()) with check (id = public.requesting_user_id());
create policy profiles_family_read on public.profiles for select to authenticated using (
  exists (select 1 from public.family_members a join public.family_members b on a.family_id = b.family_id
           where a.user_id = public.requesting_user_id() and b.user_id = profiles.id));

create policy families_member_read on public.families for select to authenticated using (public.is_family_member(id));
create policy families_owner_update on public.families for update to authenticated
  using (public.is_family_owner(id)) with check (public.is_family_owner(id));
create policy families_owner_delete on public.families for delete to authenticated using (public.is_family_owner(id));

create policy fm_read on public.family_members for select to authenticated using (public.is_family_member(family_id));
create policy fm_owner_manage on public.family_members for all to authenticated
  using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));
create policy fm_self_update on public.family_members for update to authenticated
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id() and role = public.my_family_role(family_id));
create policy fm_self_delete on public.family_members for delete to authenticated using (user_id = public.requesting_user_id());

create policy invites_owner on public.family_invites for all to authenticated
  using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));

create policy parents_all on public.parents for all to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy parent_context_all on public.parent_context for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy medicines_all on public.medicines for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
create policy schedules_all on public.call_schedules for all to authenticated
  using (public.parent_in_my_family(parent_id)) with check (public.parent_in_my_family(parent_id));
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

create policy push_tokens_self on public.push_tokens for all to authenticated
  using (user_id = public.requesting_user_id()) with check (user_id = public.requesting_user_id());
create policy notifications_self on public.notifications for select to authenticated using (user_id = public.requesting_user_id());
create policy notifications_self_update on public.notifications for update to authenticated
  using (user_id = public.requesting_user_id()) with check (user_id = public.requesting_user_id());

create policy admin_calls on public.calls for select to authenticated using (public.is_admin());
create policy admin_turns on public.call_turns for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_summaries on public.call_summaries for select to authenticated using (public.is_admin());
create policy admin_flags on public.flags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_parents on public.parents for select to authenticated using (public.is_admin());
create policy admin_waitlist on public.waitlist for select to authenticated using (public.is_admin());
create policy admin_audit on public.audit_log for select to authenticated using (public.is_admin());
create policy admin_reviews on public.call_reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_config on public.app_config for select to authenticated using (public.is_admin());
create policy admin_digests on public.daily_digests for select to authenticated using (public.is_admin());

create policy storage_family_read on storage.objects for select to authenticated using (
  bucket_id in ('recordings', 'memory-lane')
  and public.is_family_member(((storage.foldername(name))[1])::uuid));
