import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./config";

/**
 * Supabase client acting as the signed-in Clerk user: the Clerk session token is sent as the access token, so Postgres
 * row level security sees the user via auth.jwt() ->> 'sub'. (Needs Clerk "Connect with Supabase" + Supabase Third-Party Auth.)
 */
export async function createServerSupabase() {
  const { getToken } = await auth();
  return createClient(supabaseUrl, supabaseKey, {
    accessToken: async () => (await getToken()) ?? null,
  });
}
