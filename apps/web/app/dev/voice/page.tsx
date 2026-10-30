"use client";

import { useState } from "react";
import { Mic, PhoneOff } from "lucide-react";
import { selectableLanguages } from "@haalo/shared";
import { Orb } from "@/components/orb";
import { Button } from "@/components/ui/button";
import { useVoiceDemo } from "@/hooks/use-voice-demo";
import { cn } from "@/lib/utils";

/** Talk to the agent in the browser (WebRTC). Development page: not linked from anywhere, hidden in production builds. */
export default function DevVoice() {
  const [lang, setLang] = useState("mr");
  const demo = useVoiceDemo();
  const live = demo.state === "live";

  if (process.env.NODE_ENV === "production") return <p className="p-10">Not available.</p>;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center gap-8 px-4 py-12 text-center">
      <div>
        <h1 className="display text-[31px]">Dev voice test</h1>
        <p className="mt-2 text-muted">
          Talks to the voice service at {process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860"} using the demo persona. Providers and
          models come from .env.
        </p>
      </div>

      <Orb className="w-[min(340px,80vw)]" state={live ? (demo.speaker === "haalo" ? "speaking" : "listening") : demo.state === "connecting" ? "connecting" : "idle"} level={demo.level} />

      <div role="radiogroup" aria-label="Language" className="flex flex-wrap justify-center gap-2">
        {selectableLanguages.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={lang === l.code}
            disabled={live}
            onClick={() => setLang(l.code)}
            className={cn("rounded-full border px-4 py-1.5 font-medium", lang === l.code ? "border-text bg-text text-bg" : "border-border bg-surface")}
          >
            {l.native_name}
          </button>
        ))}
      </div>

      {live ? (
        <Button size="lg" variant="ink" onClick={demo.stop}>
          <PhoneOff className="size-5" /> End call
        </Button>
      ) : (
        <Button size="lg" disabled={demo.state === "connecting"} onClick={() => demo.start({ language: lang, maxSeconds: 600 })}>
          <Mic className="size-5" /> {demo.state === "connecting" ? "Connecting" : "Start talking"}
        </Button>
      )}
      <p role="status" className="text-sm text-muted">
        {demo.error ? <span className="text-danger">{demo.error}</span> : `State: ${demo.state}${live ? ` · ${demo.speaker === "none" ? "quiet" : demo.speaker === "haalo" ? "Sneha speaking" : "you speaking"}` : ""}`}
      </p>
    </main>
  );
}
