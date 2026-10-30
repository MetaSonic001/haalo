"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type Phase = { name: "ready" } | { name: "sending" } | { name: "done"; message: string; ok: boolean };

export function ProofUploader({ token }: { token: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const [preview, setPreview] = useState<string | null>(null);

  const send = async (file: File) => {
    setPreview(URL.createObjectURL(file));
    setPhase({ name: "sending" });
    const form = new FormData();
    form.set("photo", file);
    try {
      const res = await fetch(`/api/proof/${token}`, { method: "POST", body: form });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      setPhase({ name: "done", ok: res.ok && Boolean(json.ok), message: json.message ?? (res.ok ? "Thank you. The family has been told." : "That did not work. Please try again.") });
    } catch {
      setPhase({ name: "done", ok: false, message: "Sneha can't be reached right now. Please try again in a moment." });
    }
  };

  return (
    <div className="w-full space-y-5">
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" id="photo" onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      {phase.name !== "done" ? (
        <Button size="lg" className="h-24 w-full text-xl" disabled={phase.name === "sending"} onClick={() => input.current?.click()}>
          <Camera className="size-8" /> {phase.name === "sending" ? "Sneha is looking..." : "Take a photo"}
        </Button>
      ) : null}
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="The photo you took" className="mx-auto max-h-72 rounded-card object-contain" />
      ) : null}
      {phase.name === "done" ? (
        <div role="status" className={`rounded-card p-6 text-left ${phase.ok ? "bg-good-bg text-good" : "bg-warn-bg text-warn"}`}>
          <p className="flex items-start gap-3 text-xl font-medium">
            {phase.ok ? <CheckCircle2 className="mt-1 size-6 shrink-0" /> : <TriangleAlert className="mt-1 size-6 shrink-0" />}
            {phase.message}
          </p>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => {
              setPhase({ name: "ready" });
              setPreview(null);
            }}
          >
            <RotateCcw className="size-4" /> Take another
          </Button>
        </div>
      ) : null}
    </div>
  );
}
