import { config } from "./config";
import { accessToken } from "./supabase";

/**
 * The website's JSON API (apps/web/app/api/care). The same endpoints serve a signed-in family (Clerk bearer token, rules enforced by
 * Supabase row level security) and the public demo family (x-haalo-demo header).
 */
async function headers(): Promise<Record<string, string>> {
  if (config.workspace) return { "x-haalo-demo": "1" };
  const token = await accessToken();
  if (!token) throw new Error("Please sign in again.");
  return { Authorization: `Bearer ${token}` };
}

export async function apiGet<T>(q: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ q, ...params }).toString();
  const res = await fetch(`${config.webUrl}/api/care/data?${qs}`, { headers: await headers() });
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message: string } } | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Couldn't reach Sneha. Please try again.");
  return json.data as T;
}

export type ActResult<T = unknown> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** Runs one of the website's guarded actions (mark a dose taken, send a message, acknowledge an alert ...). */
export async function apiAct<T = unknown>(action: string, ...args: unknown[]): Promise<T> {
  const res = await fetch(`${config.webUrl}/api/care/act`, {
    method: "POST",
    headers: { ...(await headers()), "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const json = (await res.json().catch(() => null)) as ActResult<T> | null;
  if (!json) throw new Error("Couldn't reach Sneha. Please try again.");
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}
