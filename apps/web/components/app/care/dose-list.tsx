"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { Check, Circle, Clock, PhoneCall, TriangleAlert } from "lucide-react";
import type { DoseEvent } from "@haalo/db";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/app/toast";
import { markDoseTaken } from "@/app/app/care-actions";
import { fmtTime } from "@/lib/format";

const via: Record<string, string> = {
  call: "on the daily call",
  reminder_call: "on a reminder call",
  inbound: "when they called Sneha",
  photo: "with a photo",
  family: "confirmed by the family",
  manual: "confirmed by the family",
};

export function DoseList({ doses, compact = false }: { doses: DoseEvent[]; compact?: boolean }) {
  const [items, setItems] = useState(doses);
  const [, start] = useTransition();
  const toast = useToast();
  const now = Date.now();

  const confirm = (d: DoseEvent) => {
    setItems((l) => l.map((x) => (x.id === d.id ? { ...x, status: "taken", confirmed_via: "family" } : x)));
    start(async () => {
      const r = await markDoseTaken(d.id);
      if (!r.ok) {
        setItems((l) => l.map((x) => (x.id === d.id ? d : x)));
        toast(r.error.message, "danger");
      }
    });
  };

  if (items.length === 0) return <p className="rounded-row bg-bg px-4 py-3 text-muted">No doses scheduled today.</p>;

  return (
    <ul className="space-y-2" aria-label="Today's doses">
      {items.map((d) => {
        const due = new Date(d.due_at).getTime();
        const overdue = (d.status === "pending" || d.status === "reminded") && due < now - 30 * 60_000;
        return (
          <li key={d.id} className="flex items-center gap-3 rounded-row bg-bg px-4 py-3">
            {d.status === "taken" ? (
              <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="grid size-8 shrink-0 place-items-center rounded-full bg-good text-bg">
                <Check className="size-4" strokeWidth={3} />
              </motion.span>
            ) : d.status === "missed" ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-danger-bg text-danger">
                <TriangleAlert className="size-4" />
              </span>
            ) : d.status === "reminded" ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-bg text-warn">
                <PhoneCall className="size-4" />
              </span>
            ) : overdue ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-bg text-warn">
                <Clock className="size-4" />
              </span>
            ) : (
              <Circle className="size-8 shrink-0 text-muted" strokeWidth={1.5} />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {d.medicines?.name ?? "Medicine"}
                {d.medicines?.dose_text ? <span className="font-normal text-muted"> · {d.medicines.dose_text}</span> : null}
              </p>
              <p className="text-sm text-muted">
                {fmtTime(d.due_at)}
                {d.status === "taken" && d.confirmed_via ? ` · taken ${via[d.confirmed_via] ?? ""}` : ""}
                {d.status === "reminded" ? ` · reminded ${d.reminder_attempts}×, waiting to hear` : ""}
              </p>
            </div>
            {d.status === "taken" ? <Chip tone="good">Taken</Chip> : null}
            {d.status === "missed" ? <Chip tone="danger">Missed</Chip> : null}
            {(d.status === "pending" || d.status === "reminded" || d.status === "missed") && !compact ? (
              <Button variant="secondary" size="sm" onClick={() => confirm(d)}>
                Mark taken
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
