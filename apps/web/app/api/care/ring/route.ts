import { NextResponse } from "next/server";
import { corsHeaders, preflight } from "@/lib/cors";
import { demoEnabled } from "@/lib/demo-flag";
import { pendingRing, stopRinging } from "@/lib/ring";

export const OPTIONS = preflight;

/** The parent's phone page polls this to learn whether the family just asked Sneha to call her. Demo workspace only. */
export async function GET(req: Request) {
  if (!demoEnabled) return NextResponse.json({ ringing: false }, { headers: corsHeaders });
  const parent = new URL(req.url).searchParams.get("parent") ?? "";
  const r = pendingRing(parent);
  return NextResponse.json({ ringing: Boolean(r), mode: r?.mode ?? null }, { headers: corsHeaders });
}

export async function POST(req: Request) {
  if (!demoEnabled) return NextResponse.json({ ok: false }, { status: 404, headers: corsHeaders });
  const { parent } = (await req.json().catch(() => ({}))) as { parent?: string };
  if (parent) stopRinging(parent);
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
