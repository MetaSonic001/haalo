import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@haalo/shared";
import { createServerSupabase } from "@/lib/supabase/server";

const body = z.object({ parent_id: z.string().uuid() });
const voiceUrl = () => process.env.VOICE_SERVICE_URL ?? process.env.PUBLIC_VOICE_BASE_URL ?? process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";

/**
 * "Call now" for the mobile app. The app cannot hold the voice service key, so it sends its Clerk session token as a Bearer token.
 * Clerk's middleware authenticates it; then (via RLS as that user) we check the parent belongs to their family and ask the voice service to dial.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json(fail("unauthorized", "Please sign in again."), { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(fail("invalid", "Missing parent."), { status: 400 });

  const sb = await createServerSupabase();
  const { data: parent } = await sb.from("parents").select("id, name, consent_status").eq("id", parsed.data.parent_id).maybeSingle();
  if (!parent) return NextResponse.json(fail("forbidden", "We couldn't find that parent."), { status: 403 });
  if (parent.consent_status === "declined") {
    return NextResponse.json(fail("declined", `${parent.name} asked us not to call. You may want to talk to them first.`), { status: 409 });
  }
  try {
    const res = await fetch(`${voiceUrl()}/calls/dial`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Key": process.env.INTERNAL_SERVICE_KEY ?? "" },
      body: JSON.stringify({ parent_id: parent.id }),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json(fail("voice", "Haalo couldn't start the call right now. Please try again in a minute."), { status: 502 });
    return NextResponse.json(ok(await res.json()));
  } catch {
    return NextResponse.json(fail("voice", "We couldn't reach the calling service. Please try again in a minute."), { status: 502 });
  }
}
