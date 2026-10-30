"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { selectableLanguages, type ApiResult } from "@haalo/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { track } from "@/components/analytics";

export function Waitlist() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    const utm = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          city: form.get("city") || undefined,
          parent_language: form.get("parent_language") || undefined,
          website: form.get("website") || undefined,
          source: document.referrer ? new URL(document.referrer).hostname : "direct",
          utm,
        }),
      });
      const json = (await res.json()) as ApiResult<{ already: boolean }>;
      if (!json.ok) throw new Error(json.error.message);
      track("waitlist_joined", { language: form.get("parent_language"), city: form.get("city") });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setState("idle");
    }
  }

  return (
    <section id="waitlist" className="scroll-mt-20 px-4 pb-24 sm:px-6">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-ink px-6 py-14 text-morning sm:px-12 md:py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="display text-[31px] sm:text-[39px]">Be one of the first families.</h2>
            <p className="prose-limit mt-4 text-lg text-morning/80">
              Tell us where to reach you and which language your parent speaks. We&apos;ll write when a place opens up.
            </p>
          </div>

          {state === "done" ? (
            <div role="status" className="rounded-card bg-morning/10 p-8">
              <CheckCircle2 className="size-8 text-marigold" />
              <p className="display mt-3 text-2xl">You&apos;re on the list.</p>
              <p className="mt-2 text-morning/80">We&apos;ll email you as soon as there is a place for your family.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 rounded-card bg-surface p-6 text-text">
              <Field label="Your email">
                <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your city">
                  <Input name="city" autoComplete="address-level2" placeholder="Mumbai" />
                </Field>
                <Field label="Parent's language">
                  <Select name="parent_language" defaultValue="">
                    <option value="">Choose</option>
                    {selectableLanguages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.status === "launch" ? `${l.native_name} (${l.name})` : l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" className="w-full" disabled={state === "sending"}>
                {state === "sending" ? <Loader2 className="size-5 animate-spin" /> : null}
                Join the waitlist
              </Button>
              <p className="text-sm text-muted">No spam. We only use this to contact you about Heartline.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
