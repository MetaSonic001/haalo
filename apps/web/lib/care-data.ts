import "server-only";
import type { Appointment, Contact, DoseEvent, Escalation, FamilyMessage, Insight, MedicineFull, Proof, Vital, WeeklyDigest } from "@haalo/db";
import { getDb, isLive } from "./db";

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export async function loadMedicinesFull(parentId: string): Promise<MedicineFull[]> {
  if (!(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb.from("medicines").select("*").eq("parent_id", parentId).eq("active", true).order("created_at");
  return (data ?? []) as MedicineFull[];
}

export async function loadDoses(parentId: string, days = 8): Promise<DoseEvent[]> {
  if (!(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb
    .from("dose_events")
    .select("*, medicines(name, dose_text, critical)")
    .eq("parent_id", parentId)
    .gte("due_at", since(days))
    .lte("due_at", new Date(Date.now() + 36 * 3_600_000).toISOString())
    .order("due_at");
  return (data ?? []) as DoseEvent[];
}

export async function loadVitals(parentId: string, days = 30): Promise<Vital[]> {
  if (!(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb.from("vitals").select("*").eq("parent_id", parentId).gte("measured_at", since(days)).order("measured_at");
  return (data ?? []) as Vital[];
}

export async function loadContacts(familyId: string | null): Promise<Contact[]> {
  if (!familyId || !(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb.from("contacts").select("*").eq("family_id", familyId).eq("active", true).order("priority");
  return (data ?? []) as Contact[];
}

export async function loadEscalations(parentIds: string[], limit = 8): Promise<Escalation[]> {
  if (!parentIds.length || !(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb
    .from("escalations")
    .select("*, escalation_events(*)")
    .in("parent_id", parentIds)
    .order("started_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Escalation[]).map((e) => ({
    ...e,
    escalation_events: [...(e.escalation_events ?? [])].sort((a, b) => a.id - b.id),
  }));
}

export async function loadMessages(parentIds: string[]): Promise<FamilyMessage[]> {
  if (!parentIds.length || !(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb.from("family_messages").select("*").in("parent_id", parentIds).order("created_at", { ascending: false }).limit(40);
  return (data ?? []) as FamilyMessage[];
}

export async function loadAppointments(parentIds: string[]): Promise<Appointment[]> {
  if (!parentIds.length || !(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb
    .from("appointments")
    .select("*")
    .in("parent_id", parentIds)
    .neq("status", "cancelled")
    .gte("at", since(1))
    .order("at");
  return (data ?? []) as Appointment[];
}

export type ProofWithUrl = Proof & { url: string | null };

/** Photo proofs with short-lived signed URLs (the bucket is private; only the family can read it). */
export async function loadProofs(parentIds: string[], limit = 12): Promise<ProofWithUrl[]> {
  if (!parentIds.length || !(await isLive())) return [];
  const sb = await getDb();
  const { data } = await sb.from("proofs").select("*").in("parent_id", parentIds).order("created_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as Proof[];
  return Promise.all(
    rows.map(async (p) => {
      if (!p.storage_path) return { ...p, url: null };
      const { data: signed } = await sb.storage.from("proofs").createSignedUrl(p.storage_path, 3600);
      return { ...p, url: signed?.signedUrl ?? null };
    }),
  );
}

export async function loadInsights(parentId: string): Promise<{ insights: Insight[]; digest: WeeklyDigest | null }> {
  if (!(await isLive())) return { insights: [], digest: null };
  const sb = await getDb();
  const [{ data: ins }, { data: dig }] = await Promise.all([
    sb.from("insights").select("*").eq("parent_id", parentId).order("week_start", { ascending: false }).order("created_at", { ascending: false }).limit(12),
    sb.from("weekly_digests").select("*").eq("parent_id", parentId).order("week_start", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const insights = (ins ?? []) as Insight[];
  const latest = insights[0]?.week_start;
  return { insights: latest ? insights.filter((i) => i.week_start === latest) : [], digest: (dig as WeeklyDigest) ?? null };
}

export async function loadParentToken(parentId: string): Promise<string | null> {
  if (!(await isLive())) return null;
  const sb = await getDb();
  const { data } = await sb.from("parents").select("proof_token").eq("id", parentId).maybeSingle();
  return (data?.proof_token as string) ?? null;
}

const voiceUrl = () => process.env.VOICE_SERVICE_URL ?? process.env.PUBLIC_VOICE_BASE_URL ?? process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";

export interface Occasion { date: string; name: string }

/** Upcoming festivals (only the family's chosen tradition) and the birthday, from the voice service's calendar. */
export async function loadOccasions(parentId: string): Promise<Occasion[]> {
  try {
    const res = await fetch(`${voiceUrl()}/care/calendar?parent_id=${encodeURIComponent(parentId)}`, {
      headers: { "X-Service-Key": process.env.INTERNAL_SERVICE_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return ((await res.json()) as { occasions: Occasion[] }).occasions;
  } catch {
    return [];
  }
}

// ---- pure helpers shared by pages

export const doseLabel = (d: DoseEvent) => d.medicines?.name ?? "Medicine";

/** Last N local days (oldest first) with taken / missed / total counts, for the adherence grid. */
export function adherenceByDay(doses: DoseEvent[], days = 7, tz = "Asia/Kolkata") {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const today = new Date();
  const out: Array<{ day: string; label: string; taken: number; missed: number; open: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = fmt.format(d);
    const here = doses.filter((x) => fmt.format(new Date(x.due_at)) === key);
    out.push({
      day: key,
      label: new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: tz }).format(d),
      taken: here.filter((x) => x.status === "taken").length,
      missed: here.filter((x) => x.status === "missed").length,
      open: here.filter((x) => x.status === "pending" || x.status === "reminded").length,
    });
  }
  return out;
}
