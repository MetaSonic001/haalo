import "server-only";
import type { Call, CallTurn, Flag, Parent } from "@haalo/db";
import { adminClient } from "./supabase/admin";
import { mockCalls, mockFlags, mockParent, mockTurns } from "@haalo/db";

export interface AdminOverview {
  live: Array<Call & { parent_name: string }>;
  flags: Array<Flag & { parent_name: string }>;
  daily: Array<{ day: string; calls: number; completed: number; cost: number; p95: number | null }>;
  totals: { calls: number; answerRate: number; avgDuration: number; p95: number | null; costPerCompleted: number };
  waitlist: number;
  digest: { day: string; data: Record<string, number | null> } | null;
  demo: boolean;
}

const sev = { emergency: 0, high: 1, medium: 2, low: 3 } as const;

export async function loadAdminOverview(): Promise<AdminOverview> {
  const db = adminClient();
  let calls: Call[];
  let flags: Flag[];
  let names: Record<string, string>;
  let waitlist = 0;
  let digest: AdminOverview["digest"] = null;
  const demo = !db;
  if (!db) {
    calls = mockCalls;
    flags = mockFlags;
    names = { [mockParent.id]: mockParent.name };
    waitlist = 12;
    digest = { day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), data: { calls_completed: 3, answer_rate: 0.75, avg_duration_s: 362, p95_latency_ms: 1180, flags: 2, emergency_flags: 0, cost_per_completed: 0 } };
  } else {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [c, f, p, w, dg] = await Promise.all([
      db.from("calls").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
      db.from("flags").select("*").eq("status", "open").limit(200),
      db.from("parents").select("id, name"),
      db.from("waitlist").select("id", { count: "exact", head: true }),
      db.from("daily_digests").select("day, data").order("day", { ascending: false }).limit(1).maybeSingle(),
    ]);
    digest = (dg.data as AdminOverview["digest"]) ?? null;
    calls = (c.data ?? []) as Call[];
    flags = (f.data ?? []) as Flag[];
    names = Object.fromEntries((p.data ?? []).map((x) => [x.id as string, x.name as string]));
    waitlist = w.count ?? 0;
  }

  const byDay = new Map<string, Call[]>();
  for (const c of calls) {
    const d = c.created_at.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), c]);
  }
  const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]! : null);
  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cs]) => ({
      day,
      calls: cs.length,
      completed: cs.filter((x) => x.status === "completed").length,
      cost: cs.reduce((s, x) => s + (x.cost_breakdown?.total ?? 0), 0),
      p95: p95(cs.map((x) => x.latency_p95_ms).filter((x): x is number => x != null)),
    }));
  const completed = calls.filter((c) => c.status === "completed");
  const attempted = calls.filter((c) => !["queued"].includes(c.status));
  const totalCost = calls.reduce((s, x) => s + (x.cost_breakdown?.total ?? 0), 0);

  return {
    live: calls.filter((c) => ["dialing", "in_progress"].includes(c.status)).map((c) => ({ ...c, parent_name: names[c.parent_id ?? ""] ?? "Demo" })),
    flags: flags
      .map((f) => ({ ...f, parent_name: names[f.parent_id] ?? "Unknown" }))
      .sort((a, b) => sev[a.severity] - sev[b.severity] || +new Date(b.created_at) - +new Date(a.created_at)),
    daily,
    totals: {
      calls: calls.length,
      answerRate: attempted.length ? completed.length / attempted.length : 0,
      avgDuration: completed.length ? completed.reduce((s, c) => s + (c.duration_s ?? 0), 0) / completed.length : 0,
      p95: p95(calls.map((c) => c.latency_p95_ms).filter((x): x is number => x != null)),
      costPerCompleted: completed.length ? totalCost / completed.length : 0,
    },
    waitlist,
    digest,
    demo,
  };
}

export async function loadAdminCall(id: string) {
  const db = adminClient();
  if (!db) {
    const call = mockCalls.find((c) => c.id === id) ?? mockCalls[0]!;
    return { call, turns: mockTurns as CallTurn[], parent: mockParent as Parent, review: null, demo: true };
  }
  const { data: call } = await db.from("calls").select("*").eq("id", id).maybeSingle();
  if (!call) return null;
  const [t, p, r] = await Promise.all([
    db.from("call_turns").select("*").eq("call_id", id).order("id"),
    db.from("parents").select("*").eq("id", (call as Call).parent_id ?? "").maybeSingle(),
    db.from("call_reviews").select("*").eq("call_id", id).maybeSingle(),
  ]);
  return { call: call as Call, turns: (t.data ?? []) as CallTurn[], parent: (p.data ?? null) as Parent | null, review: r.data as { rating: number; tags: string[]; notes: string } | null, demo: false };
}

export async function loadWaitlist() {
  const db = adminClient();
  if (!db) return { rows: [{ id: "1", email: "family@example.com", city: "Pune", parent_language: "mr", source: "direct", created_at: new Date().toISOString() }], demo: true };
  const { data } = await db.from("waitlist").select("id, email, city, parent_language, source, created_at").order("created_at", { ascending: false }).limit(1000);
  return { rows: (data ?? []) as Array<{ id: string; email: string; city: string | null; parent_language: string | null; source: string | null; created_at: string }>, demo: false };
}
