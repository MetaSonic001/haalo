import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export * from "./types";
export type HaaloClient = SupabaseClient;

export function makeClient(url: string, anonKey: string, options?: Parameters<typeof createClient>[2]): HaaloClient {
  if (!url || !anonKey) throw new Error("Supabase URL / anon key are not set. Add them to .env (see .env.example).");
  return createClient(url, anonKey, options);
}

/** Tomorrow's call time label like "9:00", from a `time` column value "09:00:00". */
export function formatCallTime(t: string | undefined): string {
  if (!t) return "9:00";
  const [h, m] = t.split(":");
  return `${Number(h)}:${m}`;
}
export * from "./mock";
