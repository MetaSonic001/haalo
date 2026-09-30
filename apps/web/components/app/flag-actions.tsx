"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Phone } from "lucide-react";
import type { Flag } from "@haalo/db";
import { severityTone } from "@haalo/ui-tokens";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "./toast";
import { setFlagStatus } from "@/app/app/actions";
import { track } from "@/components/analytics";
import { fmtDay, fmtTime } from "@/lib/format";

const tone = { warn: "warn", danger: "danger" } as const;

export function FlagList({ flags, parents }: { flags: Flag[]; parents: Record<string, { name: string; honorific: string; phone: string }> }) {
  const [items, setItems] = useState(flags);
  const [, start] = useTransition();
  const toast = useToast();

  const act = (f: Flag, status: "acknowledged" | "resolved") => {
    // Optimistic: the card collapses immediately; roll back if the server says no.
    setItems((l) => l.map((x) => (x.id === f.id ? { ...x, status } : x)));
    start(async () => {
      const res = await setFlagStatus(f.id, status);
      if (res.ok) {
        track("flag_acknowledged", { severity: f.severity, status });
        toast(status === "resolved" ? "Marked as resolved." : "Thanks, marked as seen.");
      } else {
        setItems((l) => l.map((x) => (x.id === f.id ? { ...x, status: f.status } : x)));
        toast(res.error.message, "danger");
      }
    });
  };

  const open = items.filter((f) => f.status === "open").sort(bySeverity);
  const done = items.filter((f) => f.status !== "open");

  return (
    <div className="space-y-8">
      <section aria-labelledby="open-h">
        <h2 id="open-h" className="mb-3 text-xl font-semibold">
          Needs you {open.length ? `(${open.length})` : ""}
        </h2>
        {open.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">Nothing needs your attention. Haalo will tell you the moment something does.</p> : null}
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {open.map((f) => {
              const p = parents[f.parent_id];
              const t = severityTone[f.severity];
              return (
                <motion.li
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2 } }}
                  className="overflow-hidden rounded-card bg-surface p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={tone[t.tone]}>{t.label}</Chip>
                    <span className="font-medium capitalize">{f.category.replace(/_/g, " ")}</span>
                    <span className="text-sm text-muted">
                      {fmtDay(f.created_at)}, {fmtTime(f.created_at)}
                    </span>
                  </div>
                  {f.evidence_quote ? <p className="mt-3 border-l-2 border-border pl-3 text-[17px]">&ldquo;{f.evidence_quote}&rdquo;</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {p ? (
                      <Button asChild variant={f.severity === "emergency" || f.severity === "high" ? "danger" : "secondary"} size="sm">
                        <a href={`tel:${p.phone}`}>
                          <Phone className="size-4" /> Call {p.honorific || p.name} now
                        </a>
                      </Button>
                    ) : null}
                    <Button variant="secondary" size="sm" onClick={() => act(f, "acknowledged")}>
                      Acknowledge
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => act(f, "resolved")}>
                      Mark resolved
                    </Button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </section>

      {done.length > 0 ? (
        <section aria-labelledby="done-h">
          <h2 id="done-h" className="mb-3 text-xl font-semibold text-muted">
            Earlier
          </h2>
          <ul className="space-y-2">
            {done.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-row bg-surface px-4 py-3">
                <Chip>{f.status === "resolved" ? "Resolved" : "Seen"}</Chip>
                <span className="capitalize">{f.category.replace(/_/g, " ")}</span>
                <span className="text-sm text-muted">{fmtDay(f.created_at)}</span>
                {f.status === "acknowledged" ? (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => act(f, "resolved")}>
                    Mark resolved
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const order = { emergency: 0, high: 1, medium: 2, low: 3 } as const;
const bySeverity = (a: Flag, b: Flag) => order[a.severity] - order[b.severity] || +new Date(b.created_at) - +new Date(a.created_at);
