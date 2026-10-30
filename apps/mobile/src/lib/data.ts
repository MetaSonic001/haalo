import {
  mockCalls, mockFlags, mockMedicines, mockMembers, mockParent, mockSummaries, mockTurns,
  type Call, type CallSchedule, type CallSummaryRow, type CallTurn, type Flag, type Medicine, type Parent,
} from "@haalo/db";
import type { NewParent } from "@haalo/shared";
import { config } from "./config";
import { apiAct, apiGet } from "./api";
import { accessToken, supabase } from "./supabase";

export interface Member {
  user_id: string;
  name: string;
  role: "owner" | "member";
  alert_prefs: { emergency: boolean; summary: boolean; missed: boolean };
}
export interface FamilyData {
  familyId: string | null;
  parents: Parent[];
  members: Member[];
}
export type CallWithSummary = Call & { summary: CallSummaryRow | null };
export interface TodayData {
  latest: CallWithSummary | null;
  recent: CallWithSummary[];
  medicines: Medicine[];
  openFlags: Flag[];
  schedule: Pick<CallSchedule, "window_start" | "days_of_week" | "paused_until"> | null;
}

const sb = () => {
  if (!supabase) throw new Error("Not connected to Supabase");
  return supabase;
};

export async function loadFamily(userId: string): Promise<FamilyData> {
  if (config.workspace) return apiGet<FamilyData>("family");
  if (config.demo) return { familyId: "f1", parents: [mockParent], members: mockMembers };
  const c = sb();
  const { data: m } = await c.from("family_members").select("family_id").eq("user_id", userId).limit(1);
  const familyId = m?.[0]?.family_id as string | undefined;
  if (!familyId) return { familyId: null, parents: [], members: [] };
  const [{ data: parents }, { data: members }] = await Promise.all([
    c.from("parents").select("*").eq("family_id", familyId).order("created_at"),
    c.from("family_members").select("user_id, role, alert_prefs, profiles(full_name)").eq("family_id", familyId),
  ]);
  return {
    familyId,
    parents: (parents ?? []) as Parent[],
    members: (members ?? []).map((x) => ({
      user_id: x.user_id as string,
      name: ((x.profiles as unknown as { full_name?: string } | null)?.full_name as string) || "Family member",
      role: x.role as "owner" | "member",
      alert_prefs: x.alert_prefs as Member["alert_prefs"],
    })),
  };
}

function shapeCalls(rows: unknown[]): CallWithSummary[] {
  return rows.map((r) => {
    const { call_summaries, ...call } = r as Call & { call_summaries: CallSummaryRow[] | CallSummaryRow | null };
    const s = Array.isArray(call_summaries) ? (call_summaries[0] ?? null) : call_summaries;
    return { ...(call as Call), summary: s };
  });
}

export async function loadToday(parentId: string): Promise<TodayData> {
  if (config.workspace) return apiGet<TodayData>("today", { parent: parentId });
  if (config.demo) {
    const recent = mockCalls.map((c) => ({ ...c, summary: mockSummaries[c.id] ?? null }));
    return {
      latest: recent.find((c) => c.status === "completed") ?? null,
      recent,
      medicines: mockMedicines,
      openFlags: mockFlags.filter((f) => f.status === "open"),
      schedule: { window_start: "09:00:00", days_of_week: [0, 1, 2, 3, 4, 5, 6], paused_until: null },
    };
  }
  const c = sb();
  const [{ data: calls }, { data: meds }, { data: flags }, { data: sched }] = await Promise.all([
    c.from("calls").select("*, call_summaries(*)").eq("parent_id", parentId).order("created_at", { ascending: false }).limit(30),
    c.from("medicines").select("*").eq("parent_id", parentId).eq("active", true),
    c.from("flags").select("*").eq("parent_id", parentId).eq("status", "open").order("created_at", { ascending: false }),
    c.from("call_schedules").select("window_start, days_of_week, paused_until").eq("parent_id", parentId).maybeSingle(),
  ]);
  const recent = shapeCalls(calls ?? []);
  return {
    latest: recent.find((x) => x.status === "completed") ?? null,
    recent,
    medicines: (meds ?? []) as Medicine[],
    openFlags: (flags ?? []) as Flag[],
    schedule: sched as TodayData["schedule"],
  };
}

export async function loadCall(callId: string) {
  if (config.workspace) return apiGet<{ call: Call; summary: CallSummaryRow | null; turns: CallTurn[]; parent: Parent }>("call", { id: callId });
  if (config.demo) {
    const call = mockCalls.find((c) => c.id === callId) ?? mockCalls[0]!;
    return { call, summary: mockSummaries[call.id] ?? null, turns: (call.id === "c1" ? mockTurns : []) as CallTurn[], parent: mockParent };
  }
  const c = sb();
  const { data: call } = await c.from("calls").select("*").eq("id", callId).maybeSingle();
  if (!call) throw new Error("Call not found");
  const [{ data: summary }, { data: turns }, { data: parent }] = await Promise.all([
    c.from("call_summaries").select("*").eq("call_id", callId).maybeSingle(),
    c.from("call_turns").select("*").eq("call_id", callId).order("id"),
    c.from("parents").select("*").eq("id", (call as Call).parent_id ?? "").maybeSingle(),
  ]);
  return { call: call as Call, summary: summary as CallSummaryRow | null, turns: (turns ?? []) as CallTurn[], parent: parent as Parent };
}

export async function loadFlags(parentIds: string[]): Promise<Flag[]> {
  if (config.workspace) return parentIds.length ? apiGet<Flag[]>("flags", { parents: parentIds.join(",") }) : [];
  if (config.demo) return mockFlags;
  if (!parentIds.length) return [];
  const { data } = await sb().from("flags").select("*").in("parent_id", parentIds).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as Flag[];
}

export async function setFlagStatus(flagId: string, status: "acknowledged" | "resolved", userId: string) {
  if (config.workspace) return void (await apiAct("setFlagStatus", flagId, status));
  if (config.demo) return;
  const { error } = await sb().from("flags").update({ status, acknowledged_by: userId, acknowledged_at: new Date().toISOString() }).eq("id", flagId);
  if (error) throw new Error("We couldn't update that alert. Please try again.");
}

export async function callNow(parentId: string): Promise<void> {
  if (config.workspace) return void (await apiAct("callNow", parentId)); // the demo family's phone rings in the browser
  if (config.demo) return;
  const token = await accessToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${config.webUrl}/api/calls/now`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ parent_id: parentId }),
  });
  const json = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Sneha couldn't start the call. Please try again in a minute.");
}

export async function addParent(p: NewParent, viewerId: string, viewerName: string): Promise<void> {
  if (config.demo) return;
  const c = sb();
  let { data: m } = await c.from("family_members").select("family_id").eq("user_id", viewerId).limit(1).maybeSingle();
  if (!m) {
    const { data: fid, error } = await c.rpc("create_family", { p_name: `${viewerName || "My"}'s family` });
    if (error || !fid) throw new Error("We couldn't set up your family space. Please try again.");
    m = { family_id: fid as string };
  }
  const { data: parent, error } = await c
    .from("parents")
    .insert({
      family_id: m.family_id, name: p.name, phone_e164: p.phone_e164, language: p.language, dialect: p.dialect, honorific: p.honorific,
      voice_gender: p.voice_gender, call_timezone: p.call_timezone, child_name: p.child_name || viewerName, created_by: viewerId,
    })
    .select("id")
    .single();
  if (error || !parent) throw new Error("We couldn't save this parent. Check the phone number has the country code, e.g. +91.");
  const pid = parent.id as string;
  await Promise.all([
    c.from("parent_context").insert({ parent_id: pid, interests: p.interests, family_names: p.family_names, doctor_names: p.doctor_names, vocab: p.vocab }),
    p.medicines.length ? c.from("medicines").insert(p.medicines.map((x) => ({ ...x, parent_id: pid }))) : Promise.resolve(),
    c.from("call_schedules").insert({
      parent_id: pid, days_of_week: p.days_of_week, window_start: p.window_start, window_end: p.window_end, skip_next_date: new Date().toISOString().slice(0, 10),
    }),
  ]);
}

export async function createInvite(familyId: string, userId: string): Promise<string> {
  if (config.demo) return "demo-invite-token";
  const { data, error } = await sb().from("family_invites").insert({ family_id: familyId, created_by: userId }).select("token").single();
  if (error || !data) throw new Error("Only the family owner can invite people.");
  return data.token as string;
}

export async function updateAlertPrefs(familyId: string, userId: string, prefs: Member["alert_prefs"]) {
  if (config.demo) return;
  const { error } = await sb().from("family_members").update({ alert_prefs: prefs }).eq("family_id", familyId).eq("user_id", userId);
  if (error) throw new Error("We couldn't save that. Please try again.");
}

export async function updateSchedule(parentId: string, patch: { window_start?: string; window_end?: string; days_of_week?: number[]; paused_until?: string | null }) {
  if (config.demo) return;
  const { error } = await sb().from("call_schedules").update(patch).eq("parent_id", parentId);
  if (error) throw new Error("We couldn't save the schedule. Please try again.");
}

export async function deleteParent(parentId: string) {
  if (config.demo) return;
  const { error } = await sb().from("parents").delete().eq("id", parentId);
  if (error) throw new Error("We couldn't delete that. Please try again.");
}

export async function registerPushToken(userId: string, token: string, platform: string) {
  if (config.demo) return;
  await sb().from("push_tokens").upsert({ expo_token: token, user_id: userId, platform });
}

export async function acceptInvite(token: string) {
  if (config.demo) return;
  const { error } = await sb().rpc("accept_invite", { p_token: token });
  if (error) throw new Error("This invite link has expired or was already used. Ask for a new one.");
}
