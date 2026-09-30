import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client. SERVER ONLY (route handlers / server components). Never import from client code. */
export function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
