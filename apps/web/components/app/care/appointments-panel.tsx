"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Cake, MapPin, Plus, Sparkles, Stethoscope, X } from "lucide-react";
import type { Appointment } from "@haalo/db";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/app/toast";
import { addAppointment, cancelAppointment } from "@/app/app/care-actions";
import { cn } from "@/lib/utils";

const field = "w-full rounded-input border border-border bg-bg px-4 py-3 text-base outline-none focus:border-text";
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));
const dayOnly = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso + "T12:00:00+05:30"));

export function AppointmentsPanel({
  parent, appointments, occasions,
}: {
  parent: { id: string; name: string; honorific: string };
  appointments: Appointment[];
  occasions: Array<{ date: string; name: string }>;
}) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: "", doctor: "", location: "", at: "", notes: "" });
  const [pending, start] = useTransition();
  const toast = useToast();
  const who = parent.honorific || parent.name;
  const mine = appointments.filter((a) => a.parent_id === parent.id);

  return (
    <div className="space-y-10">
      <section aria-labelledby="appt-h">
        <h2 id="appt-h" className="mb-3 text-xl font-semibold">Appointments</h2>
        <ul className="space-y-3">
          {mine.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-card bg-surface p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg"><Stethoscope className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{a.title}{a.doctor ? <span className="font-normal text-muted"> · {a.doctor}</span> : null}</p>
                <p className="text-muted">{when(a.at)}</p>
                {a.location ? <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><MapPin className="size-4" /> {a.location}</p> : null}
                {a.notes ? <p className="mt-1 text-sm text-muted">{a.notes}</p> : null}
              </div>
              <Chip tone="accent">Sneha reminds {who} on the call</Chip>
              <Button variant="ghost" size="sm" aria-label={`Cancel ${a.title}`} disabled={pending} onClick={() => start(async () => void (await cancelAppointment(a.id)))}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
          {mine.length === 0 ? <li className="rounded-card bg-surface p-6 text-muted">No appointments yet. Add one and Sneha reminds {who} the day before, and tells you the day of.</li> : null}
        </ul>

        {adding ? (
          <form
            className="mt-4 space-y-4 rounded-card bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await addAppointment(parent.id, f);
                if (r.ok) {
                  toast("Appointment added.");
                  setAdding(false);
                  setF({ title: "", doctor: "", location: "", at: "", notes: "" });
                } else toast(r.error.message, "danger");
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">What is it for<input className={cn(field, "mt-1.5")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Heart check-up" required /></label>
              <label className="block text-sm font-medium">Doctor<input className={cn(field, "mt-1.5")} value={f.doctor} onChange={(e) => setF({ ...f, doctor: e.target.value })} placeholder="Dr. Deshmukh" /></label>
              <label className="block text-sm font-medium">Date and time<input type="datetime-local" className={cn(field, "mt-1.5")} value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} required /></label>
              <label className="block text-sm font-medium">Where<input className={cn(field, "mt-1.5")} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Hospital, area" /></label>
            </div>
            <label className="block text-sm font-medium">Notes for the reminder<input className={cn(field, "mt-1.5")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Carry the last report" /></label>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>Add appointment</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
          </form>
        ) : (
          <Button variant="secondary" className="mt-4" onClick={() => setAdding(true)}><Plus className="size-4" /> Add an appointment</Button>
        )}
      </section>

      <section aria-labelledby="occ-h">
        <h2 id="occ-h" className="mb-1 text-xl font-semibold">Festivals and birthdays</h2>
        <p className="mb-3 text-muted">Sneha wishes {who} on these days. Only festivals from the tradition you chose are wished, never anyone else&apos;s.</p>
        <ul className="space-y-2">
          {occasions.map((o) => (
            <li key={o.date + o.name} className="flex items-center gap-3 rounded-row bg-surface px-4 py-3">
              {o.name.includes("birthday") ? <Cake className="size-5 text-accent" /> : <Sparkles className="size-5 text-accent" />}
              <span className="flex-1 font-medium">{o.name}</span>
              <span className="text-sm text-muted">{dayOnly(o.date)}</span>
            </li>
          ))}
          {occasions.length === 0 ? <li className="rounded-row bg-surface px-4 py-3 text-muted"><CalendarDays className="mr-2 inline size-4" />Nothing in the next ten weeks.</li> : null}
        </ul>
      </section>
    </div>
  );
}
