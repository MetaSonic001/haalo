"use client";

import { useState, useTransition } from "react";
import { BellRing, CheckCircle2, MessageSquareText, PhoneCall, Plus, ShieldCheck, Trash2, TriangleAlert, Users } from "lucide-react";
import type { Contact, Escalation, EscalationEvent } from "@haalo/db";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/app/toast";
import { acknowledgeEscalation, addContact, removeContact, setContactPriority, testEscalation } from "@/app/app/care-actions";
import { fmtDay, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "./auto-refresh";

const field = "w-full rounded-input border border-border bg-bg px-4 py-3 text-base outline-none focus:border-text";
const triggerText: Record<Escalation["trigger"], string> = {
  emergency: "Emergency said on a call",
  missed_calls: "Several days of unanswered calls",
  missed_dose: "A missed important medicine",
  parent_request: "They asked for the family",
  manual_test: "Test of the alert ladder",
};
const channelIcon = { family_push: BellRing, call: PhoneCall, sms: MessageSquareText } as const;
const statusTone = { sent: "good", answered: "good", acknowledged: "good", simulated: "warn", failed: "danger", no_answer: "warn", skipped: "neutral" } as const;
const statusWord: Record<EscalationEvent["status"], string> = {
  sent: "Sent", answered: "Answered", acknowledged: "Confirmed", simulated: "Simulated", failed: "Failed", no_answer: "No answer", skipped: "Skipped",
};

export function SafetyPanel({
  familyId, parent, contacts, escalations, telephony,
}: {
  familyId: string;
  parent: { id: string; name: string; honorific: string };
  contacts: Contact[];
  escalations: Escalation[];
  telephony: boolean;
}) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", relation: "", phone: "+91", kind: "family" as Contact["kind"] });
  const toast = useToast();
  const mine = contacts.filter((c) => c.parent_id === parent.id || c.parent_id === null).sort((a, b) => a.priority - b.priority);
  const live = escalations.some((e) => e.status === "open");
  const who = parent.honorific || parent.name;

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, okText?: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) okText && toast(okText);
      else toast(r.error?.message ?? "Something went wrong.", "danger");
    });

  return (
    <div className="space-y-10">
      <AutoRefresh every={live ? 2500 : 4000} />

      <section aria-labelledby="ladder-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ladder-h" className="text-xl font-semibold">Who Sneha contacts for {who}</h2>
            <p className="text-muted">In this order, if nobody in the family responds to an emergency.</p>
          </div>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => testEscalation(parent.id), "Test started. Watch it run below.")}>
            <ShieldCheck className="size-4" /> Test the alert ladder
          </Button>
        </div>

        {!telephony ? (
          <p className="mb-4 rounded-row bg-warn-bg px-4 py-3 text-sm text-warn">
            No calling number is connected yet, so alert calls and texts are shown as <strong>simulated</strong>. The in-app and push alerts are real.
          </p>
        ) : null}

        <ol className="space-y-2">
          <li className="flex items-center gap-3 rounded-row bg-surface px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-text text-sm font-semibold text-bg">0</span>
            <Users className="size-5 text-muted" />
            <span className="flex-1"><span className="font-medium">Everyone in the family</span><span className="block text-sm text-muted">Push and in-app alert, straight away</span></span>
          </li>
          {mine.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-row bg-surface px-4 py-3">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-on-accent">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted"> · {c.relation || c.kind}</span>
                <span className="block text-sm text-muted">{c.phone_e164} · call and text</span>
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={pending || i === 0} aria-label={`Move ${c.name} up`} onClick={() =>
                    run(async () => {
                      const prev = mine[i - 1]!;
                      const a = await setContactPriority(c.id, i); // one place up
                      await setContactPriority(prev.id, i + 1);
                      return a;
                    })
                  }>
                  ↑
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} aria-label={`Remove ${c.name}`} onClick={() => run(() => removeContact(c.id), `${c.name} removed.`)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
          {mine.length === 0 ? <li className="rounded-row bg-warn-bg px-4 py-3 text-warn">No emergency contacts yet. Add a neighbour or relative who can step in.</li> : null}
        </ol>

        {adding ? (
          <form
            className="mt-4 space-y-4 rounded-card bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await addContact(familyId, { name: form.name, relation: form.relation, phone_e164: form.phone.replace(/\s/g, ""), kind: form.kind, priority: (mine.at(-1)?.priority ?? 0) + 1, parent_id: parent.id });
                if (r.ok) {
                  toast(`${form.name} added to the ladder.`);
                  setAdding(false);
                  setForm({ name: "", relation: "", phone: "+91", kind: "family" });
                } else toast(r.error.message, "danger");
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Name<input className={cn(field, "mt-1.5")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label className="block text-sm font-medium">Relation<input className={cn(field, "mt-1.5")} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="Neighbour, brother ..." /></label>
              <label className="block text-sm font-medium">Phone number<input className={cn(field, "mt-1.5")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" required /></label>
              <label className="block text-sm font-medium">Who are they
                <select className={cn(field, "mt-1.5")} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Contact["kind"] })}>
                  <option value="family">Family</option><option value="neighbour">Neighbour</option><option value="doctor">Doctor</option><option value="other">Other</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>Add to the ladder</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
          </form>
        ) : (
          <Button variant="secondary" className="mt-4" onClick={() => setAdding(true)}><Plus className="size-4" /> Add a contact</Button>
        )}
      </section>

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-3 text-xl font-semibold">Alert history</h2>
        {escalations.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No alerts have been raised. When one is, every step shows up here as it happens.</p> : null}
        <ul className="space-y-4">
          {escalations.map((e) => (
            <li key={e.id} className="rounded-card bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={e.status === "open" ? "danger" : "good"}>{e.status === "open" ? "In progress" : "Resolved"}</Chip>
                <span className="font-semibold">{triggerText[e.trigger]}</span>
                <span className="text-sm text-muted">{fmtDay(e.started_at)}, {fmtTime(e.started_at)}</span>
              </div>
              <p className="mt-2 text-muted">{e.summary}</p>
              <ol className="mt-4 space-y-2 border-l-2 border-border pl-4">
                {(e.escalation_events ?? []).map((ev) => {
                  const Icon = ev.status === "acknowledged" ? CheckCircle2 : ev.status === "failed" ? TriangleAlert : channelIcon[ev.channel];
                  return (
                    <li key={ev.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                      <Icon className="size-4 shrink-0 text-muted" />
                      <span className="font-medium">{ev.label}</span>
                      <Chip tone={statusTone[ev.status]} className="py-0.5 text-xs">{statusWord[ev.status]}</Chip>
                      <span className="text-muted">{ev.detail}</span>
                      <span className="ml-auto text-xs text-muted">{fmtTime(ev.at)}</span>
                    </li>
                  );
                })}
                {(e.escalation_events ?? []).length === 0 ? <li className="text-sm text-muted">Starting...</li> : null}
              </ol>
              {e.status === "open" ? (
                <Button className="mt-4" variant="danger" size="sm" disabled={pending} onClick={() => run(() => acknowledgeEscalation(e.id), "Thanks. The ladder has stopped.")}>
                  I am on it - stop the alerts
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
