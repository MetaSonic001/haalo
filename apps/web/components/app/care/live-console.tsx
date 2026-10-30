"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, BellRing, Check, Mic, PhoneCall, PhoneIncoming, PhoneOff, Pill } from "lucide-react";
import { Orb } from "@/components/orb";
import { Button } from "@/components/ui/button";
import { useVoiceDemo } from "@/hooks/use-voice-demo";
import { remindNow } from "@/app/app/care-actions";
import { useToast } from "@/components/app/toast";
import { cn } from "@/lib/utils";

const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";

interface FeedItem {
  i: number;
  kind: "parent" | "agent" | "action" | "alert";
  text: string;
  t: number;
}
type Mode = "checkin" | "reminder" | "inbound";

const modes: Array<{ id: Mode; title: string; sub: string; Icon: typeof PhoneCall }> = [
  { id: "checkin", title: "Daily check-in", sub: "Sneha calls and chats", Icon: PhoneCall },
  { id: "reminder", title: "Medicine reminder", sub: "A short call about a dose", Icon: Pill },
  { id: "inbound", title: "Parent calls Sneha", sub: "They ring any time", Icon: PhoneIncoming },
];

/** What to say, per language and scenario, so a demo never stalls. */
const say: Record<string, Record<string, string[]>> = {
  mr: {
    checkin: ["मी ठीक आहे, औषध घेतलं", "आज माझा बीपी एकशे पन्नास बाय पंचाण्णव आहे", "आज सकाळी बाथरूममध्ये मी पडले"],
    reminder: ["हो, मी गोळी घेतली", "अजून नाही, आता घेते"],
    inbound: ["आज माझी औषधं कधी आहेत?", "मला चक्कर येतेय, माझ्या मुलाला कळवा"],
  },
  ta: {
    checkin: ["நான் நன்றாக இருக்கிறேன், மாத்திரை சாப்பிட்டேன்", "இன்று என் இரத்த அழுத்தம் நூற்று ஐம்பது க்கு தொண்ணூற்று ஐந்து", "நான் இன்று காலை குளியலறையில் விழுந்துவிட்டேன்"],
    reminder: ["ஆமாம், மாத்திரை சாப்பிட்டேன்", "இன்னும் இல்லை, இப்போது சாப்பிடுகிறேன்"],
    inbound: ["என் மாத்திரை எப்போது?", "எனக்கு மயக்கமாக இருக்கிறது, என் மகனுக்கு சொல்லுங்கள்"],
  },
  hi: {
    checkin: ["मैं ठीक हूँ, दवाई ले ली", "आज मेरा बीपी एक सौ पचास बटा पंचानवे है", "आज सुबह मैं बाथरूम में गिर गई"],
    reminder: ["हाँ, मैंने दवाई ले ली", "अभी नहीं, अभी लेती हूँ"],
    inbound: ["मेरी दवाई कब लेनी है?", "मुझे चक्कर आ रहा है, मेरी बेटी को बताओ"],
  },
};

export interface LiveParent {
  id: string;
  name: string;
  honorific: string;
  language: string;
  languageName: string;
}

export function LiveConsole({ parents }: { parents: LiveParent[] }) {
  const router = useRouter();
  const toast = useToast();
  const demo = useVoiceDemo();
  const [parentId, setParentId] = useState(parents[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("checkin");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [prepping, startPrep] = useTransition();
  const [wasLive, setWasLive] = useState(false);
  const next = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const parent = parents.find((p) => p.id === parentId) ?? parents[0];
  const live = demo.state === "live";
  const busy = live || demo.state === "connecting";

  // Poll the voice service's live feed for this call.
  useEffect(() => {
    if (!demo.callId) return;
    next.current = 0;
    setFeed([]);
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${VOICE_URL}/live/${demo.callId}?after=${next.current}`, { cache: "no-store" });
        const j = (await r.json()) as { items: FeedItem[]; next: number };
        if (!stop && j.items.length) {
          next.current = j.next;
          setFeed((f) => [...f, ...j.items]);
        }
      } catch {
        /* the voice service may be restarting: try again on the next tick */
      }
    };
    const t = setInterval(tick, 800);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [demo.callId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [feed.length]);

  // When a call ends, the summary and alerts land a few seconds later: refresh the dashboard twice.
  useEffect(() => {
    if (live) setWasLive(true);
    if (!live && wasLive && demo.state === "ended") {
      setWasLive(false);
      const a = setTimeout(() => router.refresh(), 7000);
      const b = setTimeout(() => router.refresh(), 16000);
      return () => {
        clearTimeout(a);
        clearTimeout(b);
      };
    }
  }, [live, wasLive, demo.state, router]);

  const begin = () => {
    if (!parent) return;
    const go = () => demo.start({ language: parent.language, mode, parentId: parent.id, maxSeconds: 300 });
    if (mode === "reminder") {
      // Put one of their medicines "due now" first, so the reminder call has something to be about.
      startPrep(async () => {
        const r = await remindNow(parent.id);
        if (!r.ok) return toast(r.error.message, "danger");
        if (r.data.medicine) toast(`${r.data.medicine} is now due. Calling ${parent.honorific}.`);
        go();
      });
    } else go();
  };

  const hints = parent ? say[parent.language]?.[mode] : undefined;
  const orbState = live ? (demo.speaker === "haalo" ? "speaking" : "listening") : demo.state === "connecting" ? "connecting" : "idle";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <div className="rounded-card bg-surface p-6">
          <div className="flex justify-center py-2">
            <Orb className="w-[min(260px,70vw)]" state={orbState} level={demo.level} />
          </div>
          <p role="status" className="mt-2 text-center text-sm text-muted">
            {demo.error ? <span className="text-danger">{demo.error}</span> : live ? (demo.speaker === "haalo" ? "Sneha is speaking" : demo.speaker === "you" ? "Listening to you" : "Connected") : demo.state === "connecting" ? "Connecting..." : demo.state === "ended" ? "Call ended" : "Ready"}
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Who is being called">
            {parents.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                aria-pressed={p.id === parentId}
                onClick={() => setParentId(p.id)}
                className={cn("rounded-full border px-4 py-1.5 font-medium disabled:opacity-60", p.id === parentId ? "border-text bg-text text-bg" : "border-border bg-bg")}
              >
                {p.honorific || p.name} <span className="text-xs opacity-70">· {p.languageName}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What kind of call">
            {modes.map(({ id, title, sub, Icon }) => (
              <button
                key={id}
                role="radio"
                aria-checked={mode === id}
                disabled={busy}
                onClick={() => setMode(id)}
                className={cn("rounded-row border p-3 text-left disabled:opacity-60", mode === id ? "border-text bg-bg" : "border-border")}
              >
                <Icon className="mb-1.5 size-5" />
                <span className="block font-medium leading-tight">{title}</span>
                <span className="block text-xs text-muted">{sub}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            {busy ? (
              <Button size="lg" variant="ink" onClick={demo.stop}><PhoneOff className="size-5" /> End the call</Button>
            ) : (
              <Button size="lg" disabled={prepping || !parent} onClick={begin}>
                <Mic className="size-5" /> {prepping ? "Getting ready..." : `Talk as ${parent?.honorific ?? "the parent"}`}
              </Button>
            )}
          </div>
        </div>

        {hints ? (
          <div className="rounded-card bg-surface p-5">
            <p className="text-sm font-medium text-muted">Try saying, in {parent?.languageName}</p>
            <ul className="mt-2 space-y-2">
              {hints.map((h) => (
                <li key={h} className="rounded-row bg-bg px-4 py-2.5 text-[17px]" lang={parent?.language}>{h}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">Or just speak naturally. Sneha understands mixed languages too.</p>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[420px] flex-col rounded-card bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Activity className="size-5" /> Live: what Sneha hears and does</h2>
        <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto pr-1" aria-live="polite" style={{ maxHeight: 520 }}>
          {feed.length === 0 ? <p className="text-muted">Start a call and the conversation appears here as it happens, along with everything Sneha does: confirming a dose, saving a reading, alerting the family.</p> : null}
          {feed.map((f) =>
            f.kind === "parent" || f.kind === "agent" ? (
              <div key={f.i} data-kind={f.kind} className={cn("flex", f.kind === "parent" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-[18px] px-4 py-2.5 text-[16px] leading-snug", f.kind === "parent" ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-bg")}>
                  <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide opacity-60">{f.kind === "parent" ? parent?.honorific : "Sneha"}</span>
                  {f.text}
                </div>
              </div>
            ) : (
              <div key={f.i} data-kind={f.kind} className={cn("flex items-start gap-2 rounded-row px-3.5 py-2.5 text-[15px] font-medium", f.kind === "alert" ? "bg-danger-bg text-danger" : "bg-good-bg text-good")}>
                {f.kind === "alert" ? <BellRing className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}
                <span>{f.text}</span>
              </div>
            ),
          )}
        </div>
        {demo.state === "ended" || (!live && feed.length > 0) ? (
          <div className="mt-4 border-t border-border pt-4 text-sm">
            <p className="font-medium">After the call, check:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm"><Link href={`/app/medicines?p=${parentId}`}>Medicines</Link></Button>
              <Button asChild variant="secondary" size="sm"><Link href={`/app/health?p=${parentId}`}>Health readings</Link></Button>
              <Button asChild variant="secondary" size="sm"><Link href={`/app/safety?p=${parentId}`}>Alert ladder</Link></Button>
              <Button asChild variant="secondary" size="sm"><Link href={`/app/alerts?p=${parentId}`}>Alerts</Link></Button>
              <Button asChild variant="secondary" size="sm"><Link href={`/app/calls?p=${parentId}`}>Calls</Link></Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
