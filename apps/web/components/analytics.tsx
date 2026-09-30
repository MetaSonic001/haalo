"use client";

import { useEffect } from "react";

type PostHog = typeof import("posthog-js").default;
let ph: PostHog | null = null;
let starting: Promise<PostHog | null> | null = null;

/** PostHog is optional and loaded lazily: without NEXT_PUBLIC_POSTHOG_KEY it costs nothing (no bundle, no request). */
function load(): Promise<PostHog | null> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);
  starting ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
    });
    ph = posthog;
    return posthog;
  });
  return starting;
}

export function Analytics() {
  useEffect(() => {
    // Wait for idle so analytics never competes with first paint.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => void load());
  }, []);
  return null;
}

export type HaaloEvent =
  | "waitlist_joined"
  | "parent_added"
  | "first_call_completed"
  | "summary_opened"
  | "flag_acknowledged"
  | "call_now_tapped"
  | "demo_started";

export function track(event: HaaloEvent, props?: Record<string, unknown>) {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  void load().then((p) => (p ?? ph)?.capture(event, props));
}
