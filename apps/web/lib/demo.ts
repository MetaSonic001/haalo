import "server-only";
import { cookies, headers } from "next/headers";

/**
 * The demo workspace: a sandbox family with made-up data (seeded by services/voice haalo_voice.demo_seed) that anyone can open at /demo.
 * It runs on the service-role client, so every query in demo mode is scoped to this one family (see lib/db.ts, lib/guard.ts).
 * Real families are never reachable from it, and the sandbox parents have fictional phone numbers that the scheduler never dials.
 */
import { DEMO_COOKIE, demoEnabled } from "./demo-flag";

export { DEMO_COOKIE, demoEnabled };
export const DEMO_FAMILY_ID = process.env.DEMO_FAMILY_ID ?? "";
export const DEMO_USER_ID = "demo-user";

export async function isDemoSession(): Promise<boolean> {
  if (!demoEnabled) return false;
  if ((await cookies()).get(DEMO_COOKIE)?.value === "1") return true;
  // The demo mobile app has no cookies: it sends this header instead (the sandbox family is public by design).
  return (await headers()).get("x-haalo-demo") === "1";
}
