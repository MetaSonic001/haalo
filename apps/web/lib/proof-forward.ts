import "server-only";
import { voiceUrl } from "./voice";

export const MAX_PHOTO_BYTES = 6_000_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Validates an uploaded photo and hands it to the voice service's vision reader. */
export async function forwardPhoto(file: File | null, parentId: string, uploadedBy: string): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!file || !TYPES.includes(file.type)) return { status: 415, body: { ok: false, message: "Please send a photo (JPEG, PNG or WebP)." } };
  if (file.size > MAX_PHOTO_BYTES) return { status: 413, body: { ok: false, message: "That photo is too large. Please try a smaller one." } };
  const form = new FormData();
  form.set("parent_id", parentId);
  form.set("uploaded_by", uploadedBy);
  form.set("file", file, file.name || "photo.jpg");
  try {
    const res = await fetch(`${voiceUrl()}/care/proofs`, { method: "POST", headers: { "X-Service-Key": process.env.INTERNAL_SERVICE_KEY ?? "" }, body: form, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { status: res.status, body: { ok: false, message: typeof json.detail === "string" ? json.detail : "Sneha couldn't read that photo. Please try again." } };
    return { status: 200, body: json };
  } catch {
    return { status: 503, body: { ok: false, message: "Sneha can't be reached right now. Please try again in a minute." } };
  }
}
