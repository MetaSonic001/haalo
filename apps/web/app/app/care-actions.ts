"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, e164, type ApiResult } from "@haalo/shared";
import { requireViewer } from "@/lib/auth";
import { getDb, isLive } from "@/lib/db";
import { isDemoSession } from "@/lib/demo";
import { allowed, allowedParent } from "@/lib/guard";
import { ringParent } from "@/lib/ring";
import { voicePost } from "@/lib/voice";

const refresh = () => revalidatePath("/app", "layout");
const noAccess = () => fail("forbidden", "We couldn't find that.");
const unavailable = () => fail("demo", "This needs a database. Add your Supabase keys to .env, or open the demo workspace at /demo.");

// ------------------------------------------------------------------ medicines + doses
const medicineInput = z.object({
  name: z.string().trim().min(1, "Enter the medicine name").max(80),
  dose_text: z.string().trim().max(80).default(""),
  times: z.array(z.string().trim().min(1)).min(1, "Pick at least one time").max(6),
  stock_count: z.number().int().min(0).max(1000).nullable().default(null),
  critical: z.boolean().default(false),
  purpose: z.string().trim().max(80).default(""),
});

export async function addMedicine(parentId: string, input: unknown): Promise<ApiResult<null>> {
  await requireViewer();
  const parsed = medicineInput.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Please check the details.");
  if (!(await isLive())) return unavailable();
  if (!(await allowedParent(parentId))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("medicines").insert({ ...parsed.data, parent_id: parentId });
  if (error) return fail("db", "We couldn't save that medicine. Please try again.");
  refresh();
  return ok(null);
}

export async function updateMedicine(id: string, patch: { stock_count?: number | null; critical?: boolean; times?: string[] }): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("medicines", id))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("medicines").update({ ...patch, ...(patch.stock_count !== undefined ? { refill_notified_at: null } : {}) }).eq("id", id);
  if (error) return fail("db", "We couldn't save that. Please try again.");
  refresh();
  return ok(null);
}

export async function removeMedicine(id: string): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("medicines", id))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("medicines").update({ active: false }).eq("id", id);
  if (error) return fail("db", "We couldn't remove that. Please try again.");
  refresh();
  return ok(null);
}

/** A family member confirms a dose themselves (they were there, or the parent told them). */
export async function markDoseTaken(eventId: string): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("dose_events", eventId))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("dose_events").update({ status: "taken", confirmed_via: "family", confirmed_at: new Date().toISOString() }).eq("id", eventId);
  if (error) return fail("db", "We couldn't update that dose.");
  refresh();
  return ok(null);
}

/** Real families: ring the parent now about doses that are due and unconfirmed. Demo parents: put a dose "due now" so the reminder call can be tried. */
export async function remindNow(parentId: string): Promise<ApiResult<{ mode: "call" | "dose_due"; medicine?: string }>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowedParent(parentId))) return noAccess();
  if (await isDemoSession()) {
    const r = await voicePost<{ medicine: string }>("/care/demo/due-dose", { parent_id: parentId });
    if (!r.ok) return fail("voice", r.message);
    ringParent(parentId, "reminder"); // her phone page rings with the reminder call
    refresh();
    return ok({ mode: "dose_due", medicine: r.data.medicine });
  }
  const r = await voicePost("/care/reminder-call", { parent_id: parentId });
  if (!r.ok) return fail("voice", r.status === 409 ? "No dose is due or unconfirmed right now." : r.message);
  refresh();
  return ok({ mode: "call" });
}

// ------------------------------------------------------------------ contacts + escalation
const contactInput = z.object({
  name: z.string().trim().min(1, "Enter their name").max(60),
  relation: z.string().trim().max(60).default(""),
  phone_e164: e164,
  kind: z.enum(["family", "neighbour", "doctor", "other"]).default("family"),
  priority: z.number().int().min(1).max(9).default(1),
  parent_id: z.string().nullable().default(null),
});

export async function addContact(familyId: string, input: unknown): Promise<ApiResult<null>> {
  await requireViewer();
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Please check the details.");
  if (!(await isLive())) return unavailable();
  if (parsed.data.parent_id && !(await allowedParent(parsed.data.parent_id))) return noAccess();
  if ((await isDemoSession()) && /^\+91(?!9000000)/.test(parsed.data.phone_e164)) {
    return fail("demo", "In the demo workspace please use a made-up number like +91 90000 00099, so nobody real gets an alert.");
  }
  const sb = await getDb();
  const { error } = await sb.from("contacts").insert({ ...parsed.data, family_id: familyId });
  if (error) return fail("db", "We couldn't save that contact. Please try again.");
  refresh();
  return ok(null);
}

export async function removeContact(id: string): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("contacts", id))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("contacts").update({ active: false }).eq("id", id);
  if (error) return fail("db", "We couldn't remove that contact.");
  refresh();
  return ok(null);
}

export async function setContactPriority(id: string, priority: number): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("contacts", id))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("contacts").update({ priority: Math.min(9, Math.max(1, priority)) }).eq("id", id);
  if (error) return fail("db", "We couldn't reorder that.");
  refresh();
  return ok(null);
}

export async function testEscalation(parentId: string): Promise<ApiResult<{ id: string }>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowedParent(parentId))) return noAccess();
  const r = await voicePost<{ escalation_id: string }>("/care/escalate", { parent_id: parentId, trigger: "manual_test" });
  if (!r.ok) return fail("voice", r.message);
  refresh();
  return ok({ id: r.data.escalation_id });
}

export async function acknowledgeEscalation(id: string): Promise<ApiResult<null>> {
  const viewer = await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("escalations", id))) return noAccess();
  const r = await voicePost("/care/escalations/" + encodeURIComponent(id) + "/ack", { by: `contact:${viewer.name || "family"}` });
  if (!r.ok) return fail("voice", r.message);
  refresh();
  return ok(null);
}

// ------------------------------------------------------------------ family messages
const messageInput = z.object({ kind: z.enum(["note", "question"]), body: z.string().trim().min(2, "Write a few words").max(400, "Please keep it under 400 characters") });

export async function sendMessage(parentId: string, input: unknown): Promise<ApiResult<null>> {
  const viewer = await requireViewer();
  const parsed = messageInput.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Please check the message.");
  if (!(await isLive())) return unavailable();
  if (!(await allowedParent(parentId))) return noAccess();
  const sb = await getDb();
  const { data: parent } = await sb.from("parents").select("family_id").eq("id", parentId).maybeSingle();
  if (!parent) return noAccess();
  const { error } = await sb.from("family_messages").insert({
    family_id: parent.family_id, parent_id: parentId, from_user_id: viewer.id, from_name: viewer.name || "A family member", ...parsed.data,
  });
  if (error) return fail("db", "We couldn't save that message. Please try again.");
  refresh();
  return ok(null);
}

export async function deleteMessage(id: string): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("family_messages", id))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("family_messages").delete().eq("id", id).eq("status", "queued");
  if (error) return fail("db", "We couldn't remove that message.");
  refresh();
  return ok(null);
}

// ------------------------------------------------------------------ appointments
const apptInput = z.object({
  title: z.string().trim().min(1, "Enter what the appointment is for").max(80),
  doctor: z.string().trim().max(60).default(""),
  location: z.string().trim().max(100).default(""),
  at: z.string().min(8, "Pick a date and time"),
  notes: z.string().trim().max(200).default(""),
});

export async function addAppointment(parentId: string, input: unknown): Promise<ApiResult<null>> {
  const viewer = await requireViewer();
  const parsed = apptInput.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Please check the details.");
  const when = new Date(parsed.data.at);
  if (Number.isNaN(+when)) return fail("invalid", "Pick a valid date and time");
  if (!(await isLive())) return unavailable();
  if (!(await allowedParent(parentId))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("appointments").insert({ ...parsed.data, at: when.toISOString(), parent_id: parentId, created_by: viewer.id });
  if (error) return fail("db", "We couldn't save that appointment.");
  refresh();
  return ok(null);
}

export async function cancelAppointment(id: string): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowed("appointments", id))) return noAccess();
  const sb = await getDb();
  const { error } = await sb.from("appointments").update({ status: "cancelled" }).eq("id", id);
  if (error) return fail("db", "We couldn't cancel that.");
  refresh();
  return ok(null);
}

// ------------------------------------------------------------------ insights + demo
export async function refreshInsights(parentId: string): Promise<ApiResult<{ count: number }>> {
  await requireViewer();
  if (!(await isLive())) return unavailable();
  if (!(await allowedParent(parentId))) return noAccess();
  const r = await voicePost<{ insights: unknown[] }>("/care/insights/run", { parent_id: parentId });
  if (!r.ok) return fail("voice", r.message);
  refresh();
  return ok({ count: r.data.insights.length });
}

export async function resetDemoWorkspace(): Promise<ApiResult<null>> {
  await requireViewer();
  if (!(await isDemoSession())) return fail("forbidden", "Only the demo workspace can be reset.");
  const r = await voicePost("/care/demo/reset", {});
  if (!r.ok) return fail("voice", r.message);
  refresh();
  return ok(null);
}
