import type { AppNotification, Call, CallSummaryRow, CallTurn, Flag, Medicine, Parent } from "./types";

/** Realistic demo data used only when Supabase isn't configured (local development). */
const day = 86_400_000;
const iso = (offsetDays: number, h: number, m = 0) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const mockParent: Parent = {
  id: "p1", family_id: "f1", name: "Shobha", phone_e164: "+919876543210", language: "mr", dialect: "Pune", honorific: "Aai",
  child_name: "Riya", call_timezone: "Asia/Kolkata", voice_gender: "female", pace: 0.9, silence_ms: 1000,
  consent_status: "granted", consent_at: iso(-6, 9), recording_consent: false, notes: "", created_at: iso(-7, 10),
};

export const mockMedicines: Medicine[] = [
  { id: "m1", parent_id: "p1", name: "BP tablet", dose_text: "1 tablet", times: ["morning"], active: true },
  { id: "m2", parent_id: "p1", name: "Calcium", dose_text: "1 tablet", times: ["evening"], active: true },
];

const mkCall = (id: string, offset: number, status: Call["status"], dur: number): Call => ({
  id, parent_id: "p1", direction: "outbound", status, scheduled_for: iso(offset, 9), started_at: iso(offset, 9, 1), ended_at: iso(offset, 9, 1 + Math.round(dur / 60)),
  duration_s: dur, provider: "twilio", language: "mr", stt_provider: "groq_whisper", tts_provider: "sarvam", llm_model: "demo",
  latency_p50_ms: 720, latency_p95_ms: 1180, cost_breakdown: { total: 0 }, recording_path: null, end_reason: "completed",
  is_consent_call: false, block_reason: null, error_code: null, error_detail: null, created_at: iso(offset, 9),
});

export const mockCalls: Call[] = [mkCall("c1", 0, "completed", 372), mkCall("c2", -1, "completed", 318), mkCall("c3", -2, "no_answer", 0), mkCall("c4", -3, "completed", 401)];

export const mockSummaries: Record<string, CallSummaryRow> = {
  c1: {
    call_id: "c1", created_at: iso(0, 9, 8), mood: "good",
    summary_for_family: "Aai sounded cheerful and took her BP tablet. She went to the temple with Shobha kaku. Her knee was a little sore in the evening, so Haalo will ask again tomorrow.",
    data: {
      mood: "good", meds: [{ name: "BP tablet", taken: true }, { name: "Calcium", taken: false, note: "Takes it in the evening" }], ate: true, slept: "well",
      complaints: ["knee pain"], highlights: ["Went to the temple with Shobha kaku", "Watching the cricket match tonight"],
      follow_ups: ["Ask about the knee tomorrow"], new_facts: ["Aarav's exam is on the 12th"], flags: [],
      summary_for_family: "Aai sounded cheerful and took her BP tablet.",
    },
  },
  c2: {
    call_id: "c2", created_at: iso(-1, 9, 9), mood: "okay",
    summary_for_family: "Aai was a little tired but in good spirits. She had her tablets and lunch. She mentioned her knee again.",
    data: { mood: "okay", meds: [{ name: "BP tablet", taken: true }], ate: true, slept: "poorly", complaints: ["knee pain"], highlights: ["Called her sister"], follow_ups: [], new_facts: [], flags: [], summary_for_family: "" },
  },
};

export const mockTurns: CallTurn[] = [
  { id: 1, call_id: "c1", speaker: "agent", text: "नमस्कार आई, मी हालो. कसे आहात आज?", started_ms: 0, latency_ms: null, corrected_text: null },
  { id: 2, call_id: "c1", speaker: "parent", text: "छान आहे रे. आज देवळात गेले होते.", started_ms: 6200, latency_ms: 760, corrected_text: null },
  { id: 3, call_id: "c1", speaker: "agent", text: "अरे वा! कोणासोबत गेला होतात?", started_ms: 10400, latency_ms: 690, corrected_text: null },
  { id: 4, call_id: "c1", speaker: "parent", text: "शोभा काकूंसोबत. गुडघा थोडा दुखतोय संध्याकाळी.", started_ms: 14300, latency_ms: 810, corrected_text: null },
];

export const mockFlags: Flag[] = [
  { id: "fl1", call_id: "c1", parent_id: "p1", category: "recurring_complaint", severity: "medium", evidence_quote: "knee pain", source: "pattern", status: "open", created_at: iso(0, 9, 9) },
  { id: "fl2", call_id: "c4", parent_id: "p1", category: "scam", severity: "high", evidence_quote: "someone asked for my OTP", source: "keyword", status: "acknowledged", created_at: iso(-3, 9, 20) },
];

export const mockMembers = [
  { user_id: "u1", name: "Riya", email: "riya@example.com", role: "owner" as const, alert_prefs: { emergency: true, summary: true, missed: true } },
  { user_id: "u2", name: "Aditya", email: "aditya@example.com", role: "member" as const, alert_prefs: { emergency: true, summary: false, missed: true } },
];

export const mockNotifications: AppNotification[] = [];
