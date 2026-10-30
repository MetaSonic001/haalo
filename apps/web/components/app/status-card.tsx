"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Check, Circle, PhoneCall } from "lucide-react";
import type { CallSummaryRow, Medicine } from "@haalo/db";
import { Orb } from "@/components/orb";
import { Button } from "@/components/ui/button";
import { MoodBadge, moodSentence } from "./mood";
import { useToast } from "./toast";
import { callNow } from "@/app/app/actions";
import { track } from "@/components/analytics";
import { fmtDuration, fmtTime } from "@/lib/format";

interface Props {
  parent: { id: string; name: string; honorific: string; consent_status: string };
  latest: { id: string; started_at: string | null; duration_s: number | null; summary: CallSummaryRow | null } | null;
  medicines: Medicine[];
  callTime: string;
  /** Demo workspace: parents have made-up numbers, so "call now" opens the browser-based live demo instead. */
  workspace?: boolean;
}

export function StatusCard({ parent, latest, medicines, callTime, workspace = false }: Props) {
  const [pending, start] = useTransition();
  const [calling, setCalling] = useState(false);
  const toast = useToast();
  const name = parent.honorific || parent.name;
  const summary = latest?.summary;
  const taken = new Map((summary?.data.meds ?? []).map((m) => [m.name.toLowerCase(), m.taken]));

  const onCall = () => {
    track("call_now_tapped");
    setCalling(true);
    start(async () => {
      const res = await callNow(parent.id);
      if (res.ok) toast(`Sneha is calling ${name} now.`);
      else toast(res.error.message, "danger");
      setTimeout(() => setCalling(false), 4000);
    });
  };

  return (
    <section aria-labelledby="status-h" className="rounded-card bg-surface p-6 md:p-8">
      {summary ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="status-h" className="display text-[25px] md:text-[31px]">
                {moodSentence(name, summary.mood)}
              </h2>
              <p className="mt-1 text-muted">
                Called at {fmtTime(latest?.started_at)} · {fmtDuration(latest?.duration_s)}
              </p>
            </div>
            <MoodBadge mood={summary.mood} />
          </div>
          <p className="prose-limit mt-5 text-[17px] leading-relaxed">{summary.summary_for_family}</p>

          {medicines.length > 0 ? (
            <ul className="mt-6 grid gap-2 sm:grid-cols-2" aria-label="Medicines">
              {medicines.map((m) => {
                const did = taken.get(m.name.toLowerCase());
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-row bg-bg px-4 py-3">
                    {did ? (
                      <motion.span
                        initial={{ scale: 0.4 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 18 }}
                        className="grid size-7 place-items-center rounded-full bg-good text-bg"
                      >
                        <Check className="size-4" strokeWidth={3} />
                      </motion.span>
                    ) : (
                      <Circle className="size-7 text-muted" strokeWidth={1.5} />
                    )}
                    <span className="flex-1">
                      {m.name}
                      <span className="block text-sm text-muted">{did ? "Taken" : did === false ? "Not yet" : "Not mentioned"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {summary.data.highlights.length > 0 ? (
            <ul className="mt-6 space-y-1.5 text-muted">
              {summary.data.highlights.slice(0, 3).map((h) => (
                <li key={h}>· {h}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href={`/app/calls/${latest!.id}`}>Read the full call</Link>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Orb size={96} state="idle" className="shrink-0" />
          <div>
            <h2 id="status-h" className="display text-[25px]">
              {parent.consent_status === "declined" ? `${name} asked us not to call` : `Sneha will call ${name} at ${callTime} tomorrow.`}
            </h2>
            <p className="prose-limit mt-1 text-muted">
              {parent.consent_status === "declined"
                ? "Sneha has stopped calling. You may want to talk with them first."
                : "You'll get a summary here. The first call introduces Sneha as an AI assistant and asks for their permission."}
            </p>
          </div>
        </div>
      )}

      {parent.consent_status !== "declined" ? (
        <div className="mt-6 border-t border-border pt-6">
            <Button size="lg" onClick={onCall} disabled={pending || calling} className="w-full sm:w-auto">
              {calling ? <Orb size={28} state="connecting" className="-ml-1" /> : <PhoneCall className="size-5" />}
              {calling ? `Calling ${name}` : `Call ${name} now`}
            </Button>

        </div>
      ) : null}
    </section>
  );
}
