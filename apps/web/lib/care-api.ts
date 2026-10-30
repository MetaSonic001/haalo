import "server-only";
import { getViewer } from "./auth";
import { adherenceByDay, loadAppointments, loadContacts, loadDoses, loadEscalations, loadInsights, loadMedicinesFull, loadMessages, loadOccasions, loadParentToken, loadProofs, loadVitals } from "./care-data";
import { loadCall, loadFamily, loadFlags, loadToday } from "./data";
import { getDb, isLive } from "./db";
import * as core from "@/app/app/actions";
import * as care from "@/app/app/care-actions";

/**
 * The JSON API the mobile app uses (apps/mobile). It answers to the same viewer as the website:
 * a signed-in family member (Clerk bearer token) or the public demo workspace (x-haalo-demo header).
 * Everything goes through the same loaders and guarded actions as the website, so the access rules are identical.
 */
export async function queryData(q: string, params: URLSearchParams): Promise<unknown> {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError(401, "Please sign in.");
  const parent = params.get("parent") ?? "";
  switch (q) {
    case "family":
      return loadFamily(viewer.id);
    case "today":
      return loadToday(parent);
    case "call":
      return loadCall(params.get("id") ?? "");
    case "flags":
      return loadFlags((params.get("parents") ?? "").split(",").filter(Boolean));
    case "care": {
      const fam = await loadFamily(viewer.id);
      const [doses, medicines, vitals, contacts, escalations, messages, appointments, proofs, ins, token, occasions] = await Promise.all([
        loadDoses(parent, 8), loadMedicinesFull(parent), loadVitals(parent, 30), loadContacts(fam.familyId), loadEscalations([parent]),
        loadMessages([parent]), loadAppointments([parent]), loadProofs([parent], 6), loadInsights(parent), loadParentToken(parent), loadOccasions(parent),
      ]);
      return { doses, medicines, vitals, contacts, escalations, messages, appointments, proofs, insights: ins.insights, digest: ins.digest, proofToken: token, occasions, week: adherenceByDay(doses, 7) };
    }
    case "notifications": {
      if (!(await isLive())) return [];
      const sb = await getDb();
      const { data } = await sb.from("notifications").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(12);
      return data ?? [];
    }
    default:
      throw new ApiError(400, "Unknown query.");
  }
}

type AnyFn = (...a: never[]) => Promise<unknown>;
const actions: Record<string, AnyFn> = {
  setFlagStatus: core.setFlagStatus as unknown as AnyFn,
  callNow: core.callNow as unknown as AnyFn,
  markDoseTaken: care.markDoseTaken as unknown as AnyFn,
  remindNow: care.remindNow as unknown as AnyFn,
  addMedicine: care.addMedicine as unknown as AnyFn,
  updateMedicine: care.updateMedicine as unknown as AnyFn,
  removeMedicine: care.removeMedicine as unknown as AnyFn,
  addContact: care.addContact as unknown as AnyFn,
  removeContact: care.removeContact as unknown as AnyFn,
  testEscalation: care.testEscalation as unknown as AnyFn,
  acknowledgeEscalation: care.acknowledgeEscalation as unknown as AnyFn,
  sendMessage: care.sendMessage as unknown as AnyFn,
  deleteMessage: care.deleteMessage as unknown as AnyFn,
  addAppointment: care.addAppointment as unknown as AnyFn,
  cancelAppointment: care.cancelAppointment as unknown as AnyFn,
  refreshInsights: care.refreshInsights as unknown as AnyFn,
};

export async function runAction(name: string, args: unknown[]): Promise<unknown> {
  const fn = actions[name];
  if (!fn) throw new ApiError(400, "Unknown action.");
  return (fn as unknown as (...a: unknown[]) => Promise<unknown>)(...args);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
