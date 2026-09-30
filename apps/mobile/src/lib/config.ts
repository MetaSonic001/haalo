import Constants from "expo-constants";

type Extra = { supabaseUrl: string; supabaseKey: string; voiceUrl: string; posthogKey: string; clerkKey: string; eas?: { projectId?: string } };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * A phone cannot reach "localhost" on your computer. While developing, swap localhost for the address Metro is served from
 * (Expo tells us as hostUri, e.g. 192.168.0.104:8081) so the web app and voice service are reachable from the device.
 */
function reachable(url: string): string {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (!host) return url;
  return url.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, `//${host}`);
}

export const config = {
  supabaseUrl: extra.supabaseUrl,
  supabaseKey: extra.supabaseKey,
  clerkKey: extra.clerkKey,
  voiceUrl: reachable(extra.voiceUrl || "http://localhost:7860"),
  webUrl: reachable(process.env.EXPO_PUBLIC_WEB_URL || "http://localhost:3000"),
  easProjectId: extra.eas?.projectId || undefined,
  /** Missing Supabase or Clerk keys in .env: the app runs on demo data so the UI can be explored. */
  demo: !extra.supabaseUrl || !extra.supabaseKey || !extra.clerkKey,
};
