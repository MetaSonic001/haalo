import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkConfigured } from "@/lib/supabase/config";
import { DEMO_COOKIE, demoEnabled } from "@/lib/demo-flag";

const isProtected = createRouteMatcher(["/app(.*)", "/admin(.*)", "/invite(.*)"]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect(); // unauthenticated visitors are sent to /login
});

/** Next 16 names this file proxy.ts (it was middleware.ts). Clerk authenticates cookies AND Bearer tokens (the mobile app calls /api). */
export default function proxy(req: Parameters<typeof withClerk>[0], event: Parameters<typeof withClerk>[1]) {
  // The demo workspace (cookie set by /demo) needs no sign-in; it only ever reads the sandbox family.
  if (demoEnabled && req.cookies.get(DEMO_COOKIE)?.value === "1") return NextResponse.next();
  if (!clerkConfigured) {
    // No Clerk keys: local demo mode is allowed, production is not.
    if (isProtected(req) && process.env.NODE_ENV === "production") return new NextResponse("Not configured", { status: 503 });
    return NextResponse.next();
  }
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
