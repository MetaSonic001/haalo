import "server-only";

export const voiceUrl = () =>
  process.env.VOICE_SERVICE_URL ?? process.env.PUBLIC_VOICE_BASE_URL ?? process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";

/** Calls the voice service with the internal key. The caller must already have checked the viewer may touch the parent. */
export async function voicePost<T = Record<string, unknown>>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(`${voiceUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Key": process.env.INTERNAL_SERVICE_KEY ?? "" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { detail?: string };
    if (!res.ok) return { ok: false, status: res.status, message: typeof json.detail === "string" ? json.detail : `The voice service said ${res.status}` };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the calling service. Please try again in a minute." };
  }
}
