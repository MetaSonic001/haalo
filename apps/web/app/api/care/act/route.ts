import { NextResponse } from "next/server";
import { ApiError, runAction } from "@/lib/care-api";
import { corsHeaders, preflight } from "@/lib/cors";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { action?: string; args?: unknown[] } | null;
  try {
    if (!body?.action) throw new ApiError(400, "Missing action.");
    const result = await runAction(body.action, Array.isArray(body.args) ? body.args : []);
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ ok: false, error: { code: "api", message: e instanceof Error ? e.message : "Something went wrong" } }, { status, headers: corsHeaders });
  }
}
