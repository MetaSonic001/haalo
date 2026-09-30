/**
 * Row types for the tables the apps touch. Hand-written to match supabase/migrations.
 * Once a hosted project exists, regenerate the full file with:
 *   supabase gen types typescript --project-id <ref> > packages/db/src/database.gen.ts
 */
import type { CallSummary } from "@haalo/shared";

export type CallStatus =
  | "queued" | "dialing" | "in_progress" | "completed" | "no_answer" | "no_response" | "failed" | "missed";

export interface Family { id: string; name: string; plan: string; created_at: string }
export interface FamilyMember { family_id: string; user_id: string; role: "owner" | "member"; alert_prefs: { emergency: boolean; summary: boolean; missed: boolean } }
export interface Parent {
  id: string; family_id: string; name: string; phone_e164: string; language: string; dialect: string;
  honorific: string; child_name: string; call_timezone: string; voice_gender: "female" | "male";
  pace: number; silence_ms: number; consent_status: "pending" | "granted" | "declined";
  consent_at: string | null; recording_consent: boolean; notes: string; created_at: string;
}
export interface Medicine { id: string; parent_id: string; name: string; dose_text: string; times: string[]; active: boolean }
export interface CallSchedule { id: string; parent_id: string; days_of_week: number[]; window_start: string; window_end: string; paused_until: string | null; skip_next_date: string | null; active: boolean }
export interface Call {
  id: string; parent_id: string | null; direction: "outbound" | "inbound"; status: CallStatus;
  scheduled_for: string | null; started_at: string | null; ended_at: string | null; duration_s: number | null;
  provider: string | null; language: string | null; stt_provider: string | null; tts_provider: string | null;
  llm_model: string | null; latency_p50_ms: number | null; latency_p95_ms: number | null;
  cost_breakdown: Record<string, number>; recording_path: string | null; end_reason: string | null;
  is_consent_call: boolean; block_reason: string | null; error_code: string | null; error_detail: string | null; created_at: string;
}
export interface CallTurn { id: number; call_id: string; speaker: "parent" | "agent"; text: string; started_ms: number | null; latency_ms: number | null; corrected_text: string | null }
export interface CallSummaryRow { call_id: string; data: CallSummary; summary_for_family: string; mood: string | null; created_at: string }
export interface Flag {
  id: string; call_id: string | null; parent_id: string; category: string;
  severity: "low" | "medium" | "high" | "emergency"; evidence_quote: string; source: string;
  status: "open" | "acknowledged" | "resolved"; created_at: string;
}
export interface Memory { id: string; parent_id: string; fact: string; pinned: boolean }
export interface MemoryLane { id: string; parent_id: string; title: string; audio_path: string | null; transcript: string; share_consent: boolean; created_at: string }
export interface AppNotification { id: string; user_id: string; kind: string; title: string; body: string; data: Record<string, unknown>; read_at: string | null; created_at: string }
