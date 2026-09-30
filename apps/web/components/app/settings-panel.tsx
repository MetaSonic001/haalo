"use client";

import { useState, useTransition } from "react";
import { Download, Trash2 } from "lucide-react";
import type { CallSchedule, Parent } from "@haalo/db";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "./toast";
import { deleteParentData, setRecordingConsent, updateSchedule } from "@/app/app/actions";
import { DAYS } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SettingsPanel({ parent, schedule }: { parent: Parent; schedule: CallSchedule | null }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [days, setDays] = useState<number[]>(schedule?.days_of_week ?? [0, 1, 2, 3, 4, 5, 6]);
  const [from, setFrom] = useState((schedule?.window_start ?? "09:00").slice(0, 5));
  const [to, setTo] = useState((schedule?.window_end ?? "10:30").slice(0, 5));
  const [paused, setPaused] = useState(Boolean(schedule?.paused_until && new Date(schedule.paused_until) > new Date()));
  const [recording, setRecording] = useState(parent.recording_consent);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = parent.honorific || parent.name;

  const save = (extra: Partial<{ paused_until: string | null }> = {}) =>
    start(async () => {
      const r = await updateSchedule(parent.id, { window_start: from, window_end: to, days_of_week: days, ...extra });
      r.ok ? toast("Schedule saved.") : toast(r.error.message, "danger");
    });

  return (
    <div className="space-y-6">
      <section className="rounded-card bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Call schedule for {name}</h2>
          {paused ? <Chip tone="warn">Calls paused</Chip> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Days">
          {DAYS.map((d, i) => (
            <button
              key={d}
              aria-pressed={days.includes(i)}
              onClick={() => setDays((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i].sort()))}
              className={cn("size-12 rounded-full border text-sm font-medium transition-colors", days.includes(i) ? "border-text bg-text text-bg" : "border-border bg-bg")}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="mt-5 grid max-w-md grid-cols-2 gap-4">
          <Field label="Earliest call">
            <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Latest call">
            <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => save()} disabled={pending || days.length === 0}>
            Save schedule
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const next = !paused;
              setPaused(next);
              save({ paused_until: next ? new Date(Date.now() + 365 * 86_400_000).toISOString() : null });
            }}
          >
            {paused ? "Resume calls" : "Pause calls"}
          </Button>
        </div>
      </section>

      <section className="rounded-card bg-surface p-6">
        <h2 className="text-xl font-semibold">Privacy</h2>
        <div className="mt-4 flex items-center gap-4 rounded-row bg-bg px-4 py-3">
          <div className="flex-1">
            <p className="font-medium">Keep call recordings</p>
            <p className="text-sm text-muted">Off by default. Only turn on if {name} has agreed. Otherwise Haalo keeps text transcripts only.</p>
          </div>
          <button
            role="switch"
            aria-checked={recording}
            aria-label="Keep call recordings"
            onClick={() => {
              const next = !recording;
              setRecording(next);
              start(async () => {
                const r = await setRecordingConsent(parent.id, next);
                if (!r.ok) {
                  setRecording(!next);
                  toast(r.error.message, "danger");
                }
              });
            }}
            className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200", recording ? "bg-good" : "bg-border")}
          >
            <span className={cn("absolute top-1 size-6 rounded-full bg-white transition-transform duration-200", recording ? "translate-x-7" : "translate-x-1")} />
          </button>
        </div>
        <p className="mt-4 text-sm text-muted">
          Permission status:{" "}
          <strong className="text-text">{parent.consent_status === "granted" ? `${name} agreed on the first call` : parent.consent_status === "declined" ? `${name} declined` : "waiting for the first call"}</strong>
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <a href={`/api/export?parent=${parent.id}`} download>
              <Download className="size-4" /> Export everything
            </a>
          </Button>
          {confirmDelete ? (
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteParentData(parent.id);
                  r.ok ? toast(`All data for ${name} was deleted.`) : toast(r.error.message, "danger");
                  setConfirmDelete(false);
                })
              }
            >
              <Trash2 className="size-4" /> Yes, delete everything for {name}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete all data
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
