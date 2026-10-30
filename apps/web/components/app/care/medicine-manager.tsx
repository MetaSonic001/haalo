"use client";

import { useState, useTransition } from "react";
import { Pill, Plus, ShieldAlert, Trash2 } from "lucide-react";
import type { MedicineFull } from "@haalo/db";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/app/toast";
import { addMedicine, removeMedicine, updateMedicine } from "@/app/app/care-actions";
import { cn } from "@/lib/utils";

const TIMES = ["morning", "afternoon", "evening", "night"] as const;
const field = "w-full rounded-input border border-border bg-bg px-4 py-3 text-base outline-none focus:border-text";

function daysLeft(m: MedicineFull): number | null {
  if (m.stock_count === null) return null;
  return m.stock_count / Math.max(1, m.pills_per_dose * Math.max(1, m.times.length));
}

export function MedicineManager({ parentId, medicines }: { parentId: string; medicines: MedicineFull[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [times, setTimes] = useState<string[]>(["morning"]);
  const [stock, setStock] = useState("");
  const [critical, setCritical] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const save = () =>
    start(async () => {
      const r = await addMedicine(parentId, { name, dose_text: dose, times, stock_count: stock === "" ? null : Number(stock), critical });
      if (r.ok) {
        toast(`${name} added. Sneha will remind at the right times.`);
        setAdding(false);
        setName("");
        setDose("");
        setStock("");
        setCritical(false);
        setTimes(["morning"]);
      } else toast(r.error.message, "danger");
    });

  const toggleCritical = (m: MedicineFull) =>
    start(async () => {
      const r = await updateMedicine(m.id, { critical: !m.critical });
      if (!r.ok) toast(r.error.message, "danger");
    });

  const remove = (m: MedicineFull) =>
    start(async () => {
      const r = await removeMedicine(m.id);
      if (r.ok) toast(`${m.name} removed.`);
      else toast(r.error.message, "danger");
    });

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {medicines.map((m) => {
          const left = daysLeft(m);
          const low = left !== null && left <= 5;
          return (
            <li key={m.id} className="rounded-card bg-surface p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg">
                  <Pill className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">
                    {m.name} {m.dose_text ? <span className="font-normal text-muted">· {m.dose_text}</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {m.purpose ? `${m.purpose} · ` : ""}
                    {m.times.join(", ")}
                  </p>
                </div>
                {m.critical ? <Chip tone="danger"><ShieldAlert className="size-4" /> Important</Chip> : null}
                {low ? <Chip tone="warn">Running low</Chip> : null}
              </div>
              {left !== null ? (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-muted">
                    <span>{m.stock_count} left</span>
                    <span>about {Math.max(0, Math.floor(left))} days</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt" role="img" aria-label={`${Math.floor(left)} days of ${m.name} left`}>
                    <div className={cn("h-full rounded-full", low ? "bg-warn" : "bg-good")} style={{ width: `${Math.min(100, (left / 30) * 100)}%` }} />
                  </div>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => toggleCritical(m)}>
                  {m.critical ? "Not critical" : "Mark as important"}
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(m)}>
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
              {m.critical ? <p className="mt-3 text-sm text-muted">If a dose of this is missed, Sneha alerts the whole family and starts the alert ladder.</p> : null}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form
          className="space-y-4 rounded-card bg-surface p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Medicine name
              <input className={cn(field, "mt-1.5")} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amlodipine" required />
            </label>
            <label className="block text-sm font-medium">
              Dose
              <input className={cn(field, "mt-1.5")} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 5 mg, 1 tablet" />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">When to take it</legend>
            <div className="flex flex-wrap gap-2">
              {TIMES.map((t) => (
                <button
                  type="button"
                  key={t}
                  aria-pressed={times.includes(t)}
                  onClick={() => setTimes((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]))}
                  className={cn("rounded-full border px-4 py-2 font-medium capitalize", times.includes(t) ? "border-text bg-text text-bg" : "border-border bg-bg")}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Tablets left (optional)
              <input className={cn(field, "mt-1.5")} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 30" />
              <span className="mt-1 block font-normal text-muted">Sneha warns you about five days before it runs out.</span>
            </label>
            <label className="flex items-start gap-3 text-sm font-medium">
              <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)]" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
              <span>
                An important medicine
                <span className="block font-normal text-muted">A missed dose alerts the whole family.</span>
              </span>
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !name.trim() || times.length === 0}>
              Add medicine
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add a medicine
        </Button>
      )}
    </div>
  );
}
