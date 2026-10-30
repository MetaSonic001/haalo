import { NextResponse } from "next/server";
import { ApiError, queryData } from "@/lib/care-api";
import { corsHeaders, preflight } from "@/lib/cors";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const data = await queryData(url.searchParams.get("q") ?? "", url.searchParams);
    return NextResponse.json({ ok: true, data }, { headers: corsHeaders });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ ok: false, error: { message: e instanceof Error ? e.message : "Something went wrong" } }, { status, headers: corsHeaders });
  }
}
