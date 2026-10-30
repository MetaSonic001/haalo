import { z } from "zod";

export const e164 = z
  .string({ error: "Enter their phone number with the country code, e.g. +91 98765 43210" })
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Add the country code, e.g. +91 98765 43210");

export const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, e.g. 09:00");

export const consentStatus = z.enum(["pending", "granted", "declined"]);
export const callStatus = z.enum([
  "queued",
  "dialing",
  "in_progress",
  "completed",
  "no_answer",
  "no_response",
  "failed",
  "missed",
]);
export const severity = z.enum(["low", "medium", "high", "emergency"]);
export const flagStatus = z.enum(["open", "acknowledged", "resolved"]);

// ---- Add-a-parent wizard (5 steps)
export const parentStep1 = z.object({
  name: z.string({ error: "Enter their name" }).trim().min(1, "Enter their name"),
  honorific: z.string({ error: "Choose how Sneha should address them" }).trim().min(1, "Choose how Sneha should address them"),
  phone_e164: e164,
  /** How the parent knows you: Sneha says "<child_name> asked me to call". */
  child_name: z.string().trim().max(60).default(""),
});
export const parentStep2 = z.object({
  language: z.string().min(2),
  dialect: z.string().trim().max(60).default(""),
  voice_gender: z.enum(["female", "male"]).default("female"),
});
export const parentStep3 = z.object({
  window_start: timeHHMM,
  window_end: timeHHMM,
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day"),
  call_timezone: z.string().default("Asia/Kolkata"),
});
export const medicineInput = z.object({
  name: z.string().trim().min(1),
  dose_text: z.string().trim().default(""),
  times: z.array(z.string()).default([]),
});
export const parentStep4 = z.object({ medicines: z.array(medicineInput).max(20).default([]) });
export const parentStep5 = z.object({
  interests: z.array(z.string().trim().min(1)).max(12).default([]),
  family_names: z.record(z.string(), z.string()).default({}),
  doctor_names: z.array(z.string()).default([]),
  vocab: z.array(z.string()).default([]),
});
export const newParent = parentStep1.and(parentStep2).and(parentStep3).and(parentStep4).and(parentStep5);
export type NewParent = z.infer<typeof newParent>;

// ---- Post-call summary (services/voice writes this, apps read it)
export const callSummary = z.object({
  mood: z.enum(["good", "okay", "low", "unclear"]),
  meds: z.array(z.object({ name: z.string(), taken: z.boolean(), note: z.string().optional() })).default([]),
  ate: z.boolean().nullable().optional(),
  slept: z.enum(["well", "poorly", "unclear"]).default("unclear"),
  complaints: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  follow_ups: z.array(z.string()).default([]),
  new_facts: z.array(z.string()).default([]),
  flags: z.array(z.object({ category: z.string(), severity, evidence_quote: z.string() })).default([]),
  summary_for_family: z.string(),
});
export type CallSummary = z.infer<typeof callSummary>;

// ---- Waitlist
export const waitlistInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  city: z.string().trim().max(80).optional(),
  parent_language: z.string().max(10).optional(),
  phone: z.string().trim().max(20).optional(),
  source: z.string().max(60).optional(),
  utm: z.record(z.string(), z.string()).optional(),
  // honeypot: real people never fill this
  website: z.string().max(0).optional(),
});
export type WaitlistInput = z.infer<typeof waitlistInput>;

// ---- API envelope: { ok, data | error }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });
export const fail = (code: string, message: string): ApiResult<never> => ({ ok: false, error: { code, message } });

// ---- Flags actions
export const flagAction = z.object({ status: z.enum(["acknowledged", "resolved"]) });

// ---- Admin QA
export const callReviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(["misheard", "wrong_language", "too_long", "unsafe", "great"])).default([]),
  notes: z.string().max(1000).default(""),
});
