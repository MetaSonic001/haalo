"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Copy, Pill, Activity, Droplets, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/app/toast";
import { fmtDay, fmtTime } from "@/lib/format";
import type { ProofWithUrl } from "@/lib/care-data";

const kindIcon = { pill: Pill, bp: Activity, sugar: Droplets, other: ImageIcon } as const;
const kindWord = { pill: "Medicine", bp: "Blood pressure", sugar: "Blood sugar", other: "Photo" } as const;

export function ProofsPanel({ parent, proofs, link }: { parent: { id: string; name: string; honorific: string }; proofs: ProofWithUrl[]; link: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const who = parent.honorific || parent.name;
  const mine = proofs.filter((p) => p.parent_id === parent.id);

  const upload = async (file: File) => {
    setBusy(true);
    const form = new FormData();
    form.set("parent_id", parent.id);
    form.set("photo", file);
    try {
      const res = await fetch("/api/proofs", { method: "POST", body: form });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (res.ok && json.ok) {
        toast(json.message ?? "Photo read and saved.");
        router.refresh();
      } else toast(json.message ?? "That photo couldn't be read.", "danger");
    } catch {
      toast("Upload failed. Please try again.", "danger");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <section aria-labelledby="proof-h" className="space-y-4">
      <div>
        <h2 id="proof-h" className="text-xl font-semibold">Photo proof (optional)</h2>
        <p className="text-muted">
          If {who} has a smartphone, they can open a personal link and tap one button to show a medicine strip or a blood-pressure monitor. Sneha reads it, marks the dose
          as taken or saves the reading, and tells you.
        </p>
      </div>

      {link ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-surface p-4">
          <code className="min-w-0 flex-1 truncate rounded-row bg-bg px-3 py-2 text-sm">{link}</code>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : `Copy ${who}'s link`}
          </Button>
          <Button asChild variant="ghost" size="sm"><a href={link} target="_blank" rel="noreferrer">Open it</a></Button>
        </div>
      ) : null}

      <div>
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" id="proof-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          <Camera className="size-4" /> {busy ? "Reading the photo..." : "Upload a photo for " + who}
        </Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((p) => {
          const Icon = kindIcon[p.kind];
          return (
            <li key={p.id} className="overflow-hidden rounded-card bg-surface">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={p.summary || kindWord[p.kind]} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-bg text-muted"><Icon className="size-10" /></div>
              )}
              <div className="space-y-1 p-4">
                <Chip><Icon className="size-4" /> {kindWord[p.kind]}</Chip>
                <p className="font-medium">{p.summary || "Photo saved"}</p>
                <p className="text-sm text-muted">{fmtDay(p.created_at)}, {fmtTime(p.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {mine.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No photos yet.</p> : null}
    </section>
  );
}
