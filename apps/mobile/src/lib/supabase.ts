import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * The Clerk session token is the Supabase access token, so Postgres row level security sees the user as auth.jwt() ->> 'sub'.
 * The session provider registers Clerk's getToken here once the user is signed in.
 */
let tokenGetter: (() => Promise<string | null>) | null = null;
export function setTokenGetter(fn: (() => Promise<string | null>) | null) {
  tokenGetter = fn;
}
export const accessToken = async () => (tokenGetter ? tokenGetter() : null);

export const supabase = config.demo || config.workspace ? null : createClient(config.supabaseUrl, config.supabaseKey, { accessToken });
