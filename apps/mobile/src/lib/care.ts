import type { Appointment, Contact, DoseEvent, Escalation, FamilyMessage, Insight, MedicineFull, Vital, WeeklyDigest } from "@haalo/db";
import { apiAct, apiGet } from "./api";
import { config } from "./config";
import { useCached } from "./use-cached";

export interface ProofItem { id: string; parent_id: string; kind: "pill" | "bp" | "sugar" | "other"; summary: string; created_at: string; url: string | null }
export interface CareData {
  doses: DoseEvent[];
  medicines: MedicineFull[];
  vitals: Vital[];
  contacts: Contact[];
  escalations: Escalation[];
  messages: FamilyMessage[];
  appointments: Appointment[];
  proofs: ProofItem[];
  insights: Insight[];
  digest: WeeklyDigest | null;
  proofToken: string | null;
  occasions: Array<{ date: string; name: string }>;
  week: Array<{ day: string; label: string; taken: number; missed: number; open: number }>;
}
export interface Notice { id: string; kind: string; title: string; body: string; created_at: string; data: Record<string, unknown> }

/** In the demo build the app polls so changes made by a phone call show up within seconds, as a push would in the real build. */
export const POLL_MS = config.workspace ? 3500 : undefined;

export function useCare(parentId: string | undefined) {
  return useCached<CareData | null>(`care:${parentId}`, async () => (parentId ? apiGet<CareData>("care", { parent: parentId }) : null), [parentId], { pollMs: POLL_MS });
}

export const loadNotices = () => apiGet<Notice[]>("notifications");

/** Runs a website action and throws its plain-language error message if it fails. */
export const act = <T = unknown>(name: string, ...args: unknown[]) => apiAct<T>(name, ...args);

export const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
export const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
