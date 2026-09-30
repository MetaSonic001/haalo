import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { clerkConfigured } from "@/lib/supabase/config";
import { Orb } from "@/components/orb";
import { LogoMark } from "@/components/landing/nav";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const viewer = await getViewer();
  if (viewer && !viewer.demo) redirect("/app");

  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-2">
      <div>
        <Link href="/" className="mb-10 flex items-center gap-2.5" aria-label="Haalo home">
          <LogoMark />
          <span className="display text-xl">Haalo</span>
        </Link>
        <h1 className="display text-[31px] sm:text-[39px]">Welcome back.</h1>
        <p className="prose-limit mt-3 text-muted">Sign in to see how your parents are doing today.</p>
        <div className="mt-8">
          {clerkConfigured ? (
            <SignIn routing="path" path="/login" fallbackRedirectUrl="/app" appearance={{ variables: { colorPrimary: "#1B2246", borderRadius: "12px", fontFamily: "inherit" } }} />
          ) : (
            <div className="max-w-sm space-y-3 rounded-card bg-warn-bg p-5 text-warn">
              <p className="font-medium">Sign-in isn&apos;t connected yet.</p>
              <p className="text-sm">
                Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to .env (see .env.example). Until then you can explore the dashboard with demo data.
              </p>
              <Button asChild variant="ink">
                <Link href="/app">Open the demo dashboard</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="hidden justify-center md:flex">
        <Orb className="w-[min(380px,80%)]" />
      </div>
    </main>
  );
}
