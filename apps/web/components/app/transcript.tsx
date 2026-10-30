"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import type { CallTurn } from "@haalo/db";
import { cn } from "@/lib/utils";

type WithT = CallTurn & { translated_text?: string | null };

/** Transcript is collapsed by default. Original text always available; English is generated once on demand and cached. */
export function Transcript({ callId, turns, agentName = "Sneha", parentName }: { callId: string; turns: CallTurn[]; agentName?: string; parentName: string }) {
  const [open, setOpen] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tr, setTr] = useState<Record<number, string>>(() =>
    Object.fromEntries((turns as WithT[]).filter((t) => t.translated_text).map((t) => [t.id, t.translated_text as string])),
  );

  async function showEnglish() {
    setTranslated(true);
    if (turns.every((t) => tr[t.id])) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${callId}/translate`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Translation isn't available right now.");
      setTr((prev) => ({ ...prev, ...json.data.translations }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation isn't available right now.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-card bg-surface">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 rounded-card px-6 py-5 text-left">
        <span>
          <span className="block text-xl font-semibold">Full conversation</span>
          <span className="block text-sm text-muted">{turns.length} turns · visible only to your family</span>
        </span>
        <ChevronDown className={cn("size-5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-border px-6 pb-6 pt-4">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-muted">Show</span>
            <button onClick={() => setTranslated(false)} className={cn("rounded-full px-3 py-1", !translated ? "bg-text text-bg" : "bg-surface-alt")}>
              Original
            </button>
            <button onClick={showEnglish} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1", translated ? "bg-text text-bg" : "bg-surface-alt")}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} English
            </button>
          </div>
          {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
          <ol className="space-y-3">
            {turns.map((t) => (
              <li key={t.id} className={cn("flex", t.speaker === "parent" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-row px-4 py-2.5", t.speaker === "parent" ? "bg-accent text-on-accent" : "bg-bg")}>
                  <p className="text-xs font-medium opacity-70">{t.speaker === "parent" ? parentName : agentName}</p>
                  <p>{translated ? (tr[t.id] ?? (busy ? "Translating" : "Not translated yet")) : (t.corrected_text ?? t.text)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
