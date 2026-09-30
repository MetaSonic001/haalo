import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { fail, ok, waitlistInput } from "@haalo/shared";
import { adminClient } from "@/lib/supabase/admin";

const hits = new Map<string, number[]>();
function limited(ip: string, max = 6, windowMs = 10 * 60_000) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json(fail("rate_limited", "Too many attempts. Please try again in a few minutes."), { status: 429 });

  const parsed = waitlistInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(fail("invalid", parsed.error.issues[0]?.message ?? "Please check your details."), { status: 400 });
  }
  const { website: _honeypot, ...row } = parsed.data;

  const db = adminClient();
  if (!db) {
    // No database yet: in development keep signups in a local file so the form is testable end to end.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(fail("unavailable", "Signups are temporarily unavailable. Please try again soon."), { status: 503 });
    }
    const dir = path.resolve(process.cwd(), ".data");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "waitlist.jsonl"), JSON.stringify({ ...row, at: new Date().toISOString() }) + "\n");
    return NextResponse.json(ok({ already: false }));
  }

  const { error } = await db.from("waitlist").insert(row);
  if (error?.code === "23505") return NextResponse.json(ok({ already: true })); // already on the list: same friendly result
  if (error) return NextResponse.json(fail("db", "We couldn't save that. Please try again."), { status: 500 });
  return NextResponse.json(ok({ already: false }));
}
