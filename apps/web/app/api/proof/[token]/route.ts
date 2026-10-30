import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { forwardPhoto } from "@/lib/proof-forward";

const hits = new Map<string, number[]>();
function limited(key: string, max = 12, windowMs = 600_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

/** The parent's personal photo link: the token in the URL identifies the parent. No sign-in, no app, one big button. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{24}$/.test(token)) return NextResponse.json({ ok: false, message: "This link isn't valid." }, { status: 404 });
  if (limited(token)) return NextResponse.json({ ok: false, message: "That's a lot of photos. Please try again in a little while." }, { status: 429 });
  const db = adminClient();
  if (!db) return NextResponse.json({ ok: false, message: "Sneha isn't set up yet." }, { status: 503 });
  const { data: parent } = await db.from("parents").select("id").eq("proof_token", token).maybeSingle();
  if (!parent) return NextResponse.json({ ok: false, message: "This link isn't valid." }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const { status, body } = await forwardPhoto((form?.get("photo") as File | null) ?? null, parent.id as string, "parent_link");
  return NextResponse.json(body, { status });
}
