"use client";

import { useState } from "react";
import { Loader2, Mic, PhoneOff } from "lucide-react";
import { Orb } from "@/components/orb";
import { Button } from "@/components/ui/button";
import { useVoiceDemo } from "@/hooks/use-voice-demo";
import { useTurnstile } from "@/hooks/use-turnstile";
import { track } from "@/components/analytics";
import { cn } from "@/lib/utils";
import { launchLanguages, PRODUCT } from "@haalo/shared";

export function Hero({ showDemo = false }: { showDemo?: boolean }) {
  const [lang, setLang] = useState(launchLanguages[0]!.code);
  const demo = useVoiceDemo();
  const ts = useTurnstile();
  const active = launchLanguages.find((l) => l.code === lang)!;
  const busy = demo.state === "connecting";
  const live = demo.state === "live";

  const orbState = live ? (demo.speaker === "haalo" ? "speaking" : "listening") : busy ? "connecting" : "idle";
  const caption = live
    ? demo.speaker === "haalo"
      ? "Sneha is speaking"
      : demo.speaker === "you"
        ? "Sneha hears you"
        : "Say hello, Sneha is listening"
    : busy
      ? "Connecting"
      : demo.state === "ended"
        ? "That was a demo call. Want one for your parents?"
        : "A three-minute demo call. No sign-up.";

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-16">
        <div>
          <h1 className="display text-[39px] sm:text-[49px] md:text-[56px]">{PRODUCT.tagline}</h1>
          <p className="prose-limit mt-6 text-lg text-muted">
            Heartline calls your parents every morning in Marathi, Hindi or English, checks on medicines and mood, and sends you a two-line
            summary.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {live ? (
              <Button size="lg" variant="ink" onClick={demo.stop}>
                <PhoneOff className="size-5" /> End demo call
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={busy || (ts.enabled && !ts.token)}
                onClick={() => {
                  track("demo_started", { language: lang });
                  void demo.start({ language: lang, turnstileToken: ts.token });
                  ts.reset();
                }}
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
                Hear Sneha in {active.name.replace(" (India)", "")}
              </Button>
            )}
            {showDemo ? (
              <Button asChild size="lg" variant="secondary">
                <a href="/demo">Open the family dashboard</a>
              </Button>
            ) : null}
            <Button asChild size="lg" variant={showDemo ? "ghost" : "secondary"}>
              <a href="#waitlist">Join the waitlist</a>
            </Button>
          </div>

          <div role="radiogroup" aria-label="Demo language" className="mt-6 flex flex-wrap gap-2">
            {launchLanguages.map((l) => (
              <button
                key={l.code}
                role="radio"
                aria-checked={l.code === lang}
                disabled={live || busy}
                onClick={() => setLang(l.code)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-base font-medium transition-colors duration-150 disabled:opacity-50",
                  l.code === lang ? "border-text bg-text text-bg" : "border-border bg-surface hover:border-text",
                )}
              >
                {l.native_name}
              </button>
            ))}
          </div>

          <div ref={ts.ref} className="mt-4 max-w-xs" />
          <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">
            {demo.error ? <span className="text-danger">{demo.error}</span> : caption}
          </p>
        </div>

        <div className="relative mx-auto flex w-full max-w-[440px] items-center justify-center py-8">
          <Orb state={orbState} level={demo.level} className="w-[min(420px,80vw)]" />
        </div>
      </div>
    </section>
  );
}
