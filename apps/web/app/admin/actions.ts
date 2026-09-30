"use server";

import { revalidatePath } from "next/cache";
import { callReviewInput, fail, ok, type ApiResult } from "@haalo/shared";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export async function saveReview(callId: string, input: unknown): Promise<ApiResult<null>> {
  const admin = await requireAdmin();
  const parsed = callReviewInput.safeParse(input);
  if (!parsed.success) return fail("invalid", "Choose a rating from 1 to 5.");
  const db = adminClient();
  if (!db) return ok(null);
  const { error } = await db.from("call_reviews").upsert({ call_id: callId, reviewer: admin.id, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return fail("db", "Couldn't save the review.");
  await db.from("audit_log").insert({ actor: admin.id, action: "call.review", entity: "calls", entity_id: callId });
  revalidatePath(`/admin/calls/${callId}`);
  return ok(null);
}

/** Corrected transcripts feed the consented data flywheel (fine-tuning an open ASR model on elderly phone speech). */
export async function correctTurn(turnId: number, text: string): Promise<ApiResult<null>> {
  const admin = await requireAdmin();
  const db = adminClient();
  if (!db) return ok(null);
  const { error } = await db.from("call_turns").update({ corrected_text: text.trim() || null }).eq("id", turnId);
  if (error) return fail("db", "Couldn't save the correction.");
  await db.from("audit_log").insert({ actor: admin.id, action: "turn.correct", entity: "call_turns", entity_id: String(turnId) });
  return ok(null);
}

export async function resolveFlagAdmin(flagId: string): Promise<ApiResult<null>> {
  const admin = await requireAdmin();
  const db = adminClient();
  if (!db) return ok(null);
  const { error } = await db.from("flags").update({ status: "resolved", acknowledged_by: admin.id, acknowledged_at: new Date().toISOString() }).eq("id", flagId);
  if (error) return fail("db", "Couldn't update the flag.");
  await db.from("audit_log").insert({ actor: admin.id, action: "flag.resolve", entity: "flags", entity_id: flagId });
  revalidatePath("/admin");
  return ok(null);
}
