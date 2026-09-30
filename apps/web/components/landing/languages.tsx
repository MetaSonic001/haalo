"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { languages } from "@haalo/shared";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";

function PlayButton({ code, name }: { code: string; name: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);

  async function toggle() {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    setState("loading");
    try {
      if (!audio.current) {
        const a = new Audio(`${VOICE_URL}/tts/sample?lang=${code}`);
        a.onended = () => setState("idle");
        a.onerror = () => setState("error");
        audio.current = a;
      }
      await audio.current.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={state === "playing" ? `Pause ${name} sample` : `Play a ${name} sample`}
      title={state === "error" ? "The voice service isn't reachable right now" : undefined}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-transform duration-150 active:scale-95",
        state === "error" && "opacity-50",
      )}
    >
      {state === "loading" ? (
        <Loader2 className="size-5 animate-spin" />
      ) : state === "playing" ? (
        <Pause className="size-5" />
      ) : (
        <Play className="size-5" />
      )}
    </button>
  );
}

/** Performance: each script's font is only requested when its glyphs are first rendered. The non-launch scripts render once
 *  this section scrolls into view, so the first paint downloads Latin + Devanagari only. */
function useSeen<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

export function Languages() {
  const [ref, seen] = useSeen<HTMLElement>();
  const selectable = languages.filter((l) => l.status !== "planned");
  const shown = seen ? selectable : selectable.filter((l) => l.status === "launch");
  const loop = [...shown, ...shown];
  const scriptName = (l: (typeof languages)[number]) => (seen || l.status === "launch" ? l.native_name : l.name);
  return (
    <section ref={ref} id="languages" className="scroll-mt-20 overflow-hidden bg-surface py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="display max-w-2xl text-[31px] sm:text-[39px]">In the language they think in.</h2>
        <p className="prose-limit mt-4 text-lg text-muted">
          Marathi, Hindi and Indian English today, with more on the way. Haalo follows how your parents actually talk, including the
          English words that slip in mid-sentence.
        </p>
      </div>

      <div className="marquee mt-12 select-none" aria-hidden>
        <div className="marquee-track flex w-max gap-10 whitespace-nowrap">
          {loop.map((l, i) => (
            <span key={`${l.code}-${i}`} className="display text-[49px] text-text/85">
              {l.native_name}
            </span>
          ))}
        </div>
      </div>

      <ul className="mx-auto mt-12 grid max-w-6xl gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {languages.map((l) => (
          <li key={l.code} className={cn("flex items-center gap-4 rounded-row bg-bg px-4 py-3", l.status === "planned" && "opacity-60")}>
            {l.status === "planned" ? <span className="size-11 shrink-0" /> : <PlayButton code={l.code} name={l.name} />}
            <div className="min-w-0 flex-1">
              <p className="display truncate text-xl">{scriptName(l)}</p>
              <p className="text-sm text-muted">{l.name}</p>
            </div>
            <Chip tone={l.status === "launch" ? "good" : "neutral"}>
              {l.status === "launch" ? "Available" : l.status === "preview" ? "Preview" : "Coming soon"}
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}
