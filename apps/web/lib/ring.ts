import "server-only";

export type RingMode = "checkin" | "reminder";

/**
 * Demo workspace only: "Call Aai now" from the website or the mobile app cannot dial a made-up number, so it rings the parent's phone page
 * (/phone/[parent]) instead. A tiny in-memory flag is enough because the demo runs as one process.
 */
const store = globalThis as unknown as { __haaloRing?: Map<string, { at: number; mode: RingMode }> };
const rings = (store.__haaloRing ??= new Map<string, { at: number; mode: RingMode }>());

export function ringParent(parentId: string, mode: RingMode = "checkin") {
  rings.set(parentId, { at: Date.now(), mode });
}

/** The pending ring (fresh for 45 s, like a real call that stops ringing), or null. */
export function pendingRing(parentId: string): { mode: RingMode } | null {
  const r = rings.get(parentId);
  return r && Date.now() - r.at < 45_000 ? { mode: r.mode } : null;
}

export function stopRinging(parentId: string) {
  rings.delete(parentId);
}
