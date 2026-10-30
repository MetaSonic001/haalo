"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server data every few seconds while something is happening (a live alert ladder, a call in progress). */
export function AutoRefresh({ every = 3000, active = true }: { every?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every, active]);
  return null;
}
