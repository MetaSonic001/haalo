"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneCall, PhoneIncoming, PhoneOff } from "lucide-react";
import { Orb } from "@/components/orb";
import { useVoiceDemo } from "@/hooks/use-voice-demo";
import { cn } from "@/lib/utils";

const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";
type Mode = "checkin" | "reminder" | "inbound";
interface FeedItem { i: number; kind: "parent" | "agent" | "action" | "alert"; text: string }

const subtitle: Record<Mode, string> = {
  checkin: "Your daily call",
  reminder: "A reminder about your medicine",
  inbound: "Calling Sneha",
};

/** The parent's side, drawn as an ordinary phone: it rings, she answers, and she just talks. Live captions show what is said, in her language. */
export function PhoneMock({
  parentId, honorific, language, languageName, child, initialMode, autoRing,
}: {
  parentId: string; honorific: string; language: string; languageName: string; child: string; initialMode: Mode; autoRing: boolean;
}) {
  const demo = useVoiceDemo();
  const [ringing, setRinging] = useState<Mode | null>(autoRing ? initialMode : null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [secs, setSecs] = useState(0);
  const [clock, setClock] = useState("");
  const next = useRef(0);
  const live = demo.state === "live";
  const connecting = demo.state === "connecting";
  const inCall = live || connecting;

  // Clock on the lock screen.
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  // The family tapped "Call now" on the website or the mobile app: this phone rings.
  useEffect(() => {
    if (inCall || ringing) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = (await (await fetch(`/api/care/ring?parent=${parentId}`, { cache: "no-store" })).json()) as { ringing: boolean; mode: Mode | null };
        if (!stop && r.ringing) setRinging(r.mode ?? "checkin");
      } catch {
        /* the app may be restarting */
      }
    };
    const t = setInterval(poll, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [inCall, ringing, parentId]);

  // Live captions for this call.
  useEffect(() => {
    if (!demo.callId) return;
    next.current = 0;
    setFeed([]);
    let stop = false;
    const t = setInterval(async () => {
      try {
        const j = (await (await fetch(`${VOICE_URL}/live/${demo.callId}?after=${next.current}`, { cache: "no-store" })).json()) as { items: FeedItem[]; next: number };
        if (!stop && j.items.length) {
          next.current = j.next;
          setFeed((f) => [...f, ...j.items]);
        }
      } catch {
        /* try again next tick */
      }
    }, 700);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [demo.callId]);

  useEffect(() => {
    if (!live) return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  const answer = (m: Mode) => {
    setRinging(null);
    setMode(m);
    void fetch("/api/care/ring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent: parentId }) });
    void demo.start({ language, mode: m, parentId, maxSeconds: 300 });
  };
  const decline = () => {
    setRinging(null);
    void fetch("/api/care/ring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent: parentId }) });
  };

  const lines = feed.filter((f) => f.kind === "agent" || f.kind === "parent").slice(-3);
  const orbState = live ? (demo.speaker === "haalo" ? "speaking" : "listening") : connecting ? "connecting" : "idle";
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <main id="main" data-state={ringing ? "ringing" : demo.state} data-speaker={demo.speaker} data-call={demo.callId ?? ""} className="relative flex h-dvh min-h-[560px] w-full flex-col overflow-hidden bg-[#0b0f24] text-white" style={{ fontFamily: "var(--font-sans)" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_0%,rgba(243,167,18,.22),transparent_65%),radial-gradient(60%_45%_at_50%_100%,rgba(90,110,255,.18),transparent_65%)]" />

      {/* ---------------------------------------------------------- idle: lock screen */}
      {!ringing && !inCall ? (
        <div className="relative flex flex-1 flex-col items-center px-6 pb-8 pt-14 text-center">
          <p className="text-[64px] font-light leading-none tracking-tight">{clock}</p>
          <p className="mt-2 text-lg text-white/70">{honorific}&apos;s phone</p>
          <div className="mt-auto flex w-full flex-col items-center gap-4">
            {demo.state === "ended" ? <p className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/80">Call ended</p> : <p className="text-sm text-white/50">No missed calls</p>}
            <button
              onClick={() => answer("inbound")}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-base font-medium text-white/90 backdrop-blur hover:bg-white/15"
            >
              <Phone className="size-5" /> Call Sneha
            </button>
            <p className="max-w-[260px] text-xs text-white/40">An ordinary phone. Sneha calls when it is time, or {honorific} can call back any time.</p>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- ringing */}
      {ringing ? (
        <div className="relative flex flex-1 flex-col items-center px-6 pb-10 pt-16 text-center" role="alert" aria-label="Incoming call from Sneha">
          <p className="text-sm uppercase tracking-[0.18em] text-white/60">Incoming call</p>
          <div className="relative mt-8">
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[#f3a712]/30" />
            <div className="relative grid size-28 place-items-center rounded-full bg-[#f3a712] shadow-[0_0_60px_rgba(243,167,18,.5)]">
              <PhoneIncoming className="size-12 text-[#1b2246]" />
            </div>
          </div>
          <h1 className="mt-8 text-[34px] font-semibold leading-tight">Sneha</h1>
          <p className="mt-1 text-lg text-white/75">{subtitle[ringing]}</p>
          <p className="mt-1 text-sm text-white/50">An AI assistant set up by {child}</p>
          <div className="mt-auto flex w-full items-end justify-around">
            <button onClick={decline} aria-label="Decline" className="grid size-[72px] place-items-center rounded-full bg-[#e5484d] shadow-lg active:scale-95">
              <PhoneOff className="size-8" />
            </button>
            <button onClick={() => answer(ringing)} aria-label="Answer" className="grid size-[72px] place-items-center rounded-full bg-[#2fb36a] shadow-[0_0_0_10px_rgba(47,179,106,.25)] active:scale-95">
              <PhoneCall className="size-8" />
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- in a call */}
      {inCall ? (
        <div className="relative flex flex-1 flex-col px-5 pb-8 pt-10">
          <div className="text-center">
            <p className="text-2xl font-semibold">Sneha</p>
            <p className="text-sm text-white/60">{connecting ? "Connecting..." : `${mm}:${ss}`} · {languageName}</p>
          </div>
          <div className="mt-2 flex justify-center">
            <Orb size={150} state={orbState} level={demo.level} />
          </div>
          <div className="mt-2 flex flex-1 flex-col justify-end gap-3 overflow-hidden" aria-live="polite" lang={language}>
            {lines.map((l) => (
              <p
                key={l.i}
                className={cn(
                  "rounded-2xl px-4 py-3 text-[19px] leading-snug",
                  l.kind === "agent" ? "self-start bg-white/10 text-white" : "self-end bg-[#f3a712] font-medium text-[#1b2246]",
                  l === lines[lines.length - 1] ? "" : "opacity-60",
                )}
              >
                {l.text}
              </p>
            ))}
            {lines.length === 0 ? <p className="text-center text-white/50">Say hello. Sneha is listening.</p> : null}
          </div>
          <div className="mt-5 flex justify-center">
            <button onClick={demo.stop} aria-label="End call" className="grid size-[68px] place-items-center rounded-full bg-[#e5484d] shadow-lg active:scale-95">
              <PhoneOff className="size-7" />
            </button>
          </div>
          {demo.error ? <p className="mt-3 text-center text-sm text-[#ff9b93]">{demo.error}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
