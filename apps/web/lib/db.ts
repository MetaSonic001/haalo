import "server-only";
import { adminClient } from "./supabase/admin";
import { createServerSupabase } from "./supabase/server";
import { liveMode, supabaseConfigured } from "./supabase/config";
import { isDemoSession } from "./demo";

/**
 * The Supabase client for the current request.
 * - A signed-in family member: acts as that Clerk user, so row level security decides what they can touch.
 * - The demo workspace: the service-role client, with every query scoped to the demo family by lib/guard.ts.
 */
export async function getDb() {
  if (await isDemoSession()) {
    const db = adminClient();
    if (!db) throw new Error("The demo workspace needs SUPABASE_SERVICE_ROLE_KEY");
    return db;
  }
  return createServerSupabase();
}

/** True when pages should read real rows (a signed-in family, or the demo workspace). False = in-memory sample data (no Supabase keys). */
export async function isLive(): Promise<boolean> {
  if (await isDemoSession()) return supabaseConfigured;
  return liveMode;
}
