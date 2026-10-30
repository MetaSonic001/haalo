"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Star } from "lucide-react";
import type { CallTurn } from "@haalo/db";
import { Button } from "@/components/ui/button";
import { correctTurn, saveReview } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

const TAGS = [
  ["misheard", "Misheard"],
  ["wrong_language", "Wrong language"],
  ["too_long", "Too long"],
  ["unsafe", "Unsafe"],
  ["great", "Great call"],
] as const;

export function CallReview({ callId, initial }: { callId: string; initial: { rating: number; tags: string[]; notes: string } | null }) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="rounded-card bg-surface p-6">
      <h2 className="text-lg font-semibold">QA review</h2>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} onClick={() => setRating(n)}>
            <Star className={cn("size-8", n <= rating ? "fill-accent text-accent" : "text-border")} />
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {TAGS.map(([k, label]) => (
          <button key={k} aria-pressed={tags.includes(k)} onClick={() => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))}
            className={cn("rounded-full border px-3 py-1 text-sm", tags.includes(k) ? (k === "unsafe" ? "border-danger bg-danger-bg text-danger" : "border-text bg-text text-bg") : "border-border bg-bg")}>
            {label}
          </button>
        ))}
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes" className="mt-4 w-full rounded-input border border-border bg-bg p-3" />
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={!rating || pending} onClick={() => start(async () => { const r = await saveReview(callId, { rating, tags, notes }); setMsg(r.ok ? "Saved" : r.error.message); })}>
          Save review
        </Button>
        <span role="status" className="text-sm text-muted">{msg}</span>
      </div>
    </section>
  );
}

export function TranscriptEditor({ turns }: { turns: CallTurn[] }) {
  return (
    <section className="rounded-card bg-surface p-6">
      <h2 className="text-lg font-semibold">Transcript</h2>
      <p className="text-sm text-muted">Fix what the speech recogniser got wrong. Corrections feed the consented ASR improvement dataset.</p>
      <ol className="mt-4 space-y-2">
        {turns.map((t) => (
          <TurnRow key={t.id} t={t} />
        ))}
      </ol>
    </section>
  );
}

function TurnRow({ t }: { t: CallTurn }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(t.corrected_text ?? t.text);
  const [saved, setSaved] = useState(Boolean(t.corrected_text));
  const [pending, start] = useTransition();
  const slow = (t.latency_ms ?? 0) > 1200;
  return (
    <li className="grid grid-cols-[5.5rem_1fr_auto] items-start gap-3 rounded-row bg-bg px-3 py-2">
      <div className="text-xs text-muted">
        <p className="font-semibold">{t.speaker === "parent" ? "Parent" : "Sneha"}</p>
        <p>{t.started_ms != null ? `${(t.started_ms / 1000).toFixed(1)}s` : ""}</p>
        {t.latency_ms != null ? <p className={cn(slow && "font-semibold text-danger")}>{t.latency_ms} ms</p> : null}
      </div>
      {editing ? (
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} className="w-full rounded-input border border-border bg-surface p-2" />
      ) : (
        <p>
          {text} {saved ? <Check className="inline size-4 text-good" aria-label="corrected" /> : null}
        </p>
      )}
      {t.speaker === "parent" ? (
        editing ? (
          <Button size="sm" disabled={pending} onClick={() => start(async () => { await correctTurn(t.id, text); setSaved(true); setEditing(false); })}>
            Save
          </Button>
        ) : (
          <button aria-label="Edit transcript line" onClick={() => setEditing(true)} className="p-1 text-muted hover:text-text">
            <Pencil className="size-4" />
          </button>
        )
      ) : <span />}
    </li>
  );
}
