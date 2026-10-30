import { NextResponse } from "next/server";
import { DEMO_COOKIE, demoEnabled } from "@/lib/demo";

/** Opens the demo workspace: a sandbox family with made-up data. Sets a cookie and goes to the dashboard. */
export async function GET(req: Request) {
  if (!demoEnabled) return new NextResponse("The demo workspace is not enabled.", { status: 404 });
  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  const res = NextResponse.redirect(new URL(to && to.startsWith("/app") ? to : "/app", url));
  res.cookies.set(DEMO_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 6, sameSite: "lax", httpOnly: true });
  return res;
}
