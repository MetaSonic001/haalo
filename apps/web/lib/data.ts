import "server-only";
import type { Call, CallSchedule, CallSummaryRow, CallTurn, Flag, Medicine, MemoryLane, Parent } from "@haalo/db";
import { getDb, isLive } from "./db";
import { mockCalls, mockFlags, mockMedicines, mockMembers, mockParent, mockSummaries, mockTurns } from "@haalo/db";

export interface Member {
  user_id: string;
  name: string;
  email?: string;
  role: "owner" | "member";
  alert_prefs: { emergency: boolean; summary: boolean; missed: boolean };
}

export interface FamilyData {
  familyId: string | null;
  familyName: string;
  parents: Parent[];
  members: Member[];
  demo: boolean;
}

export async function loadFamily(viewerId: string): Promise<FamilyData> {
  if (!(await isLive())) {
    return { familyId: "f1", familyName: "Riya's family", parents: [mockParent], members: mockMembers, demo: true };
  }
  const sb = await getDb();
  const { data: memberships } = await sb.from("family_members").select("family_id, role").eq("user_id", viewerId).limit(1);
  const familyId = memberships?.[0]?.family_id as string | undefined;
  if (!familyId) return { familyId: null, familyName: "", parents: [], members: [], demo: false };
  const [{ data: fam }, { data: parents }, { data: members }] = await Promise.all([
    sb.from("families").select("name").eq("id", familyId).maybeSingle(),
    sb.from("parents").select("*").eq("family_id", familyId).order("created_at"),
    sb.from("family_members").select("user_id, role, alert_prefs, profiles(full_name)").eq("family_id", familyId),
  ]);
  return {
    familyId,
    familyName: (fam?.name as string) ?? "Your family",
    parents: (parents ?? []) as Parent[],
    members: (members ?? []).map((m) => ({
      user_id: m.user_id as string,
      name: ((m.profiles as unknown as { full_name?: string } | null)?.full_name as string) || "Family member",
      role: m.role as "owner" | "member",
      alert_prefs: m.alert_prefs as Member["alert_prefs"],
    })),
    demo: false,
  };
}

export interface TodayData {
  latest: (Call & { summary: CallSummaryRow | null }) | null;
  medicines: Medicine[];
  openFlags: Flag[];
  recent: Array<Call & { summary: CallSummaryRow | null }>;
  schedule: Pick<CallSchedule, "window_start" | "days_of_week" | "paused_until"> | null;
}

export async function loadToday(parentId: string): Promise<TodayData> {
  if (!(await isLive())) {
    const withSummary = mockCalls.map((c) => ({ ...c, summary: mockSummaries[c.id] ?? null }));
    return {
      latest: withSummary.find((c) => c.status === "completed") ?? null,
      medicines: mockMedicines,
      openFlags: mockFlags.filter((f) => f.status === "open"),
      recent: withSummary,
      schedule: { window_start: "09:00:00", days_of_week: [0, 1, 2, 3, 4, 5, 6], paused_until: null },
    };
  }
  const sb = await getDb();
  const [{ data: calls }, { data: meds }, { data: flags }, { data: sched }] = await Promise.all([
    sb.from("calls").select("*, call_summaries(*)").eq("parent_id", parentId).order("created_at", { ascending: false }).limit(20),
    sb.from("medicines").select("*").eq("parent_id", parentId).eq("active", true),
    sb.from("flags").select("*").eq("parent_id", parentId).eq("status", "open").order("created_at", { ascending: false }),
    sb.from("call_schedules").select("window_start, days_of_week, paused_until").eq("parent_id", parentId).maybeSingle(),
  ]);
  const recent = (calls ?? []).map((c) => {
    const { call_summaries, ...call } = c as Call & { call_summaries: CallSummaryRow[] | CallSummaryRow | null };
    const s = Array.isArray(call_summaries) ? (call_summaries[0] ?? null) : call_summaries;
    return { ...(call as Call), summary: s };
  });
  return {
    latest: recent.find((c) => c.status === "completed") ?? null,
    medicines: (meds ?? []) as Medicine[],
    openFlags: (flags ?? []) as Flag[],
    recent,
    schedule: sched as TodayData["schedule"],
  };
}

export async function loadCall(callId: string) {
  if (!(await isLive())) {
    const call = mockCalls.find((c) => c.id === callId);
    if (!call) return null;
    return { call, summary: mockSummaries[callId] ?? null, turns: callId === "c1" ? mockTurns : [], parent: mockParent };
  }
  const sb = await getDb();
  const { data: call } = await sb.from("calls").select("*").eq("id", callId).maybeSingle();
  if (!call) return null;
  const [{ data: summary }, { data: turns }, { data: parent }] = await Promise.all([
    sb.from("call_summaries").select("*").eq("call_id", callId).maybeSingle(),
    sb.from("call_turns").select("*").eq("call_id", callId).order("id"),
    sb.from("parents").select("*").eq("id", (call as Call).parent_id!).maybeSingle(),
  ]);
  return { call: call as Call, summary: (summary as CallSummaryRow) ?? null, turns: (turns ?? []) as CallTurn[], parent: parent as Parent };
}

export async function loadFlags(parentIds: string[]): Promise<Flag[]> {
  if (!(await isLive())) return mockFlags;
  if (!parentIds.length) return [];
  const sb = await getDb();
  const { data } = await sb.from("flags").select("*").in("parent_id", parentIds).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as Flag[];
}

export async function loadMemoryLane(parentIds: string[]): Promise<MemoryLane[]> {
  if (!(await isLive()) || !parentIds.length) return [];
  const sb = await getDb();
  const { data } = await sb.from("memory_lane").select("*").in("parent_id", parentIds).order("created_at", { ascending: false });
  return (data ?? []) as MemoryLane[];
}

export async function loadSchedule(parentId: string): Promise<CallSchedule | null> {
  if (!(await isLive())) {
    return { id: "s1", parent_id: parentId, days_of_week: [0, 1, 2, 3, 4, 5, 6], window_start: "09:00:00", window_end: "10:30:00", paused_until: null, skip_next_date: null, active: true };
  }
  const sb = await getDb();
  const { data } = await sb.from("call_schedules").select("*").eq("parent_id", parentId).maybeSingle();
  return (data as CallSchedule) ?? null;
}
