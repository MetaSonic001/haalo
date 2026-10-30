"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "./toast";
import { createInvite, updateAlertPrefs } from "@/app/app/actions";
import type { Member } from "@/lib/data";
import { cn } from "@/lib/utils";

type Prefs = Member["alert_prefs"];
const prefLabels: Array<[keyof Prefs, string, string]> = [
  ["emergency", "Emergencies and scams", "Falls, chest pain, distress, suspicious callers. Recommended for everyone."],
  ["summary", "Daily summary", "A two-line note after each call."],
  ["missed", "Missed calls", "When Sneha couldn't reach them two days running."],
];

export function FamilyPanel({ familyId, members, viewerId, isOwner }: { familyId: string; members: Member[]; viewerId: string; isOwner: boolean }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const mine = members.find((m) => m.user_id === viewerId) ?? members[0];
  const [prefs, setPrefs] = useState<Prefs>(mine?.alert_prefs ?? { emergency: true, summary: true, missed: true });
  const [invite, setInvite] = useState<{ url: string; qr: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const toggle = (k: keyof Prefs) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    start(async () => {
      const r = await updateAlertPrefs(familyId, next);
      if (!r.ok) {
        setPrefs(prefs);
        toast(r.error.message, "danger");
      }
    });
  };

  const makeInvite = () =>
    start(async () => {
      const r = await createInvite(familyId);
      if (!r.ok) return toast(r.error.message, "danger");
      const url = `${window.location.origin}/invite/${r.data.token}`;
      setInvite({ url, qr: await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#1B2246", light: "#FFFFFF" } }) });
    });

  return (
    <div className="space-y-6">
      <section className="rounded-card bg-surface p-6">
        <h2 className="text-xl font-semibold">Family circle</h2>
        <ul className="mt-4 divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 place-items-center rounded-full bg-accent font-semibold text-on-accent">{m.name.slice(0, 1).toUpperCase()}</span>
              <div className="flex-1">
                <p className="font-medium">
                  {m.name} {m.user_id === viewerId ? <span className="text-muted">(you)</span> : null}
                </p>
                {m.email ? <p className="text-sm text-muted">{m.email}</p> : null}
              </div>
              <Chip tone={m.role === "owner" ? "accent" : "neutral"}>{m.role === "owner" ? "Owner" : "Member"}</Chip>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-card bg-surface p-6">
        <h2 className="text-xl font-semibold">Your alerts</h2>
        <p className="text-sm text-muted">Choose what reaches your phone. Each family member sets their own.</p>
        <ul className="mt-4 space-y-3">
          {prefLabels.map(([k, title, hint]) => (
            <li key={k} className="flex items-center gap-4 rounded-row bg-bg px-4 py-3">
              <div className="flex-1">
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted">{hint}</p>
              </div>
              <button
                role="switch"
                aria-checked={prefs[k]}
                aria-label={title}
                onClick={() => toggle(k)}
                className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200", prefs[k] ? "bg-good" : "bg-border")}
              >
                <span className={cn("absolute top-1 size-6 rounded-full bg-white transition-transform duration-200", prefs[k] ? "translate-x-7" : "translate-x-1")} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {isOwner ? (
        <section className="rounded-card bg-surface p-6">
          <h2 className="text-xl font-semibold">Invite a sibling or spouse</h2>
          <p className="text-sm text-muted">They&apos;ll see the same calls and alerts. The link works once and expires in 7 days.</p>
          {invite ? (
            <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
              <div className="size-40 shrink-0 rounded-row bg-white p-2" dangerouslySetInnerHTML={{ __html: invite.qr }} aria-label="Invite QR code" />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="break-all rounded-row bg-bg px-4 py-3 text-sm">{invite.url}</p>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(invite.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-4" onClick={makeInvite} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Create invite link
            </Button>
          )}
        </section>
      ) : null}
    </div>
  );
}
