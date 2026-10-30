"use server";

import { revalidatePath } from "next/cache";
import { fail, flagAction, newParent, ok, type ApiResult } from "@haalo/shared";
import { requireViewer } from "@/lib/auth";
import { getDb, isLive } from "@/lib/db";
import { isDemoSession } from "@/lib/demo";
import { allowed, allowedParent } from "@/lib/guard";
import { ringParent } from "@/lib/ring";

const voiceUrl = () => process.env.VOICE_SERVICE_URL ?? process.env.PUBLIC_VOICE_BASE_URL ?? process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";

/** Demo mode (no Supabase): actions succeed without touching anything, so the UI is fully explorable. */
const demoOk = <T>(data: T): ApiResult<T> => ok(data);

export async function setFlagStatus(flagId: string, status: "acknowledged" | "resolved"): Promise<ApiResult<null>> {
  const viewer = await requireViewer();
  const parsed = flagAction.safeParse({ status });
  if (!parsed.success) return fail("invalid", "Unknown action");
  if (!(await isLive())) return demoOk(null);
  if (!(await allowed("flags", flagId))) return fail("forbidden", "We couldn't find that alert.");
  const sb = await getDb();
  const { error } = await sb
    .from("flags")
    .update({ status, acknowledged_by: viewer.id, acknowledged_at: new Date().toISOString() })
    .eq("id", flagId);
  if (error) return fail("db", "We couldn't update that alert. Please try again.");
  revalidatePath("/app", "layout");
  return ok(null);
}

export async function callNow(parentId: string): Promise<ApiResult<{ callId: string }>> {
  await requireViewer();
  if (!(await isLive())) return demoOk({ callId: "demo" });
  if (!(await allowedParent(parentId))) return fail("forbidden", "We couldn't find that parent.");
  if (await isDemoSession()) {
    // Demo parents have made-up numbers, so "call now" rings the parent's phone page instead (see /phone/[parent]).
    ringParent(parentId);
    return ok({ callId: "ringing" });
  }
  const sb = await getDb();
  // RLS: this only returns the parent if the viewer belongs to the family.
  const { data: parent } = await sb.from("parents").select("id, name, consent_status").eq("id", parentId).maybeSingle();
  if (!parent) return fail("forbidden", "We couldn't find that parent.");
  if (parent.consent_status === "declined") return fail("declined", `${parent.name} asked us not to call. You may want to talk to them first.`);
  try {
    const res = await fetch(`${voiceUrl()}/calls/dial`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Key": process.env.INTERNAL_SERVICE_KEY ?? "" },
      body: JSON.stringify({ parent_id: parentId }),
      cache: "no-store",
    });
    if (!res.ok) return fail("voice", "Sneha couldn't start the call right now. Please try again in a minute.");
    const json = (await res.json()) as { call_id: string };
    revalidatePath("/app", "layout");
    return ok({ callId: json.call_id });
  } catch {
    return fail("voice", "We couldn't reach the calling service. Please try again in a minute.");
  }
}

export async function addParent(input: unknown): Promise<ApiResult<{ parentId: string; firstCallTime: string }>> {
  const viewer = await requireViewer();
  const parsed = newParent.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Please check the details.");
  const p = parsed.data;
  const time = p.window_start;
  if (!(await isLive())) return demoOk({ parentId: "demo", firstCallTime: time });
  if (await isDemoSession()) return fail("demo", "The demo workspace is read-only for new parents, so nobody real gets a call. Sign up to add your own.");

  const sb = await getDb();
  let { data: m } = await sb.from("family_members").select("family_id").eq("user_id", viewer.id).limit(1).maybeSingle();
  if (!m) {
    const { data: fid, error } = await sb.rpc("create_family", { p_name: `${viewer.name || "My"}'s family` });
    if (error || !fid) return fail("db", "We couldn't set up your family space. Please try again.");
    m = { family_id: fid as string };
  }
  const { data: parent, error } = await sb
    .from("parents")
    .insert({
      family_id: m.family_id, name: p.name, phone_e164: p.phone_e164, language: p.language, dialect: p.dialect,
      honorific: p.honorific, voice_gender: p.voice_gender, call_timezone: p.call_timezone, child_name: p.child_name || viewer.name, created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error || !parent) return fail("db", "We couldn't save this parent. Check the phone number has the country code, e.g. +91.");

  const pid = parent.id as string;
  const today = new Date().toISOString().slice(0, 10);
  await Promise.all([
    sb.from("parent_context").insert({ parent_id: pid, interests: p.interests, family_names: p.family_names, doctor_names: p.doctor_names, vocab: p.vocab }),
    p.medicines.length ? sb.from("medicines").insert(p.medicines.map((x) => ({ ...x, parent_id: pid }))) : Promise.resolve(),
    // skip_next_date = today so the very first (consent) call happens tomorrow at the chosen time, not immediately
    sb.from("call_schedules").insert({ parent_id: pid, days_of_week: p.days_of_week, window_start: p.window_start, window_end: p.window_end, skip_next_date: today }),
  ]);
  revalidatePath("/app", "layout");
  return ok({ parentId: pid, firstCallTime: time });
}

export async function createInvite(familyId: string): Promise<ApiResult<{ token: string }>> {
  const viewer = await requireViewer();
  if (!(await isLive())) return demoOk({ token: "demo-invite-token" });
  if (await isDemoSession()) return fail("demo", "Invites are turned off in the demo workspace.");
  const sb = await getDb();
  const { data, error } = await sb.from("family_invites").insert({ family_id: familyId, created_by: viewer.id }).select("token").single();
  if (error || !data) return fail("forbidden", "Only the family owner can invite people.");
  return ok({ token: data.token as string });
}

export async function updateAlertPrefs(familyId: string, prefs: { emergency: boolean; summary: boolean; missed: boolean }): Promise<ApiResult<null>> {
  const viewer = await requireViewer();
  if (!(await isLive())) return demoOk(null);
  const sb = await getDb();
  const { error } = await sb.from("family_members").update({ alert_prefs: prefs }).eq("family_id", familyId).eq("user_id", viewer.id);
  if (error) return fail("db", "We couldn't save that. Please try again.");
  return ok(null);
}

export async function updateSchedule(
  parentId: string,
  input: { window_start: string; window_end: string; days_of_week: number[]; paused_until?: string | null },
): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return demoOk(null);
  if (!(await allowedParent(parentId))) return fail("forbidden", "We couldn't find that parent.");
  const sb = await getDb();
  const { error } = await sb.from("call_schedules").update(input).eq("parent_id", parentId);
  if (error) return fail("db", "We couldn't save the schedule. Please try again.");
  revalidatePath("/app", "layout");
  return ok(null);
}

export async function setRecordingConsent(parentId: string, on: boolean): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return demoOk(null);
  if (!(await allowedParent(parentId))) return fail("forbidden", "We couldn't find that parent.");
  const sb = await getDb();
  const { error } = await sb.from("parents").update({ recording_consent: on }).eq("id", parentId);
  return error ? fail("db", "We couldn't save that.") : ok(null);
}

export async function deleteParentData(parentId: string): Promise<ApiResult<null>> {
  const viewer = await requireViewer();
  if (!(await isLive())) return demoOk(null);
  if (await isDemoSession()) return fail("demo", "Deleting is turned off in the demo workspace.");
  const sb = await getDb();
  // RLS guarantees only a family member can delete; cascades remove calls, turns, summaries, memories, flags.
  const { error } = await sb.from("parents").delete().eq("id", parentId);
  if (error) return fail("db", "We couldn't delete that. Please try again.");
  await sb.from("audit_log").insert({ actor: viewer.id, action: "parent.delete", entity: "parents", entity_id: parentId });
  revalidatePath("/app", "layout");
  return ok(null);
}

export async function acceptInvite(token: string): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return demoOk(null);
  const sb = await getDb();
  const { error } = await sb.rpc("accept_invite", { p_token: token });
  if (error) return fail("invalid", "This invite link has expired or was already used. Ask for a new one.");
  return ok(null);
}
