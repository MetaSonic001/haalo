-- Calls now have a purpose: the daily check-in, a short medicine reminder, an inbound call from the parent, or an alert call to a contact.
-- The daily scheduler must only look at check-in calls, otherwise a reminder call would stop the day's check-in from being queued.

alter table public.calls add column if not exists purpose text not null default 'checkin'
  check (purpose in ('checkin', 'reminder', 'inbound', 'alert'));
update public.calls set purpose = 'inbound' where direction = 'inbound' and purpose = 'checkin';

alter table public.escalations drop constraint if exists escalations_trigger_check;
alter table public.escalations add constraint escalations_trigger_check
  check (trigger in ('emergency', 'missed_calls', 'missed_dose', 'parent_request', 'manual_test'));

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
    if exists (select 1 from calls c where c.parent_id = r.parent_id and c.direction = 'outbound' and c.purpose = 'checkin'
                and (c.scheduled_for at time zone r.tz)::date = local_date) then continue; end if;
    insert into calls (parent_id, direction, status, scheduled_for, is_consent_call, purpose)
    values (r.parent_id, 'outbound', 'queued', due, r.consent_status = 'pending', 'checkin');
    n := n + 1;
  end loop;
  update call_schedules s set skip_next_date = null
   where skip_next_date is not null and skip_next_date < (now() at time zone 'UTC')::date - 1;
  return n;
end $$;
