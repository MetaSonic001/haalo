import "server-only";
import { adminClient } from "./supabase/admin";
import { DEMO_FAMILY_ID, isDemoSession } from "./demo";
import { createServerSupabase } from "./supabase/server";

/**
 * Access checks for server actions that take an id from the browser.
 * Signed-in families: the Clerk-authenticated client is used, so RLS already limits every read and write to their family.
 * Demo workspace: the service-role client bypasses RLS, so we check here that the target belongs to the demo family.
 */
type Table = "parents" | "flags" | "medicines" | "dose_events" | "contacts" | "family_messages" | "appointments" | "escalations" | "proofs" | "vitals";

export async function allowed(table: Table, id: string): Promise<boolean> {
  if (!id) return false;
  if (await isDemoSession()) {
    const db = adminClient();
    if (!db) return false;
    if (table === "parents") {
      const { data } = await db.from("parents").select("family_id").eq("id", id).maybeSingle();
      return data?.family_id === DEMO_FAMILY_ID;
    }
    if (table === "contacts" || table === "family_messages") {
      const { data } = await db.from(table).select("family_id").eq("id", id).maybeSingle();
      return data?.family_id === DEMO_FAMILY_ID;
    }
    const { data } = await db.from(table).select("parent_id, parents!inner(family_id)").eq("id", id).maybeSingle();
    const fam = (data as unknown as { parents?: { family_id?: string } } | null)?.parents?.family_id;
    return fam === DEMO_FAMILY_ID;
  }
  const sb = await createServerSupabase(); // RLS: returns a row only when the viewer's family owns it
  const { data } = await sb.from(table).select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

export const allowedParent = (id: string) => allowed("parents", id);
