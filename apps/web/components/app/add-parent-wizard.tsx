"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Play, Plus, X } from "lucide-react";
import {
  getLanguage, parentStep1, parentStep2, parentStep3, selectableLanguages, type NewParent,
} from "@haalo/shared";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "./toast";
import { addParent } from "@/app/app/actions";
import { track } from "@/components/analytics";
import { DAYS } from "@/lib/format";
import { cn } from "@/lib/utils";

const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";
const STEPS = ["Who they are", "Language", "Call time", "Medicines", "What they love"] as const;
const INTEREST_SUGGESTIONS = ["Cricket", "Bhajans", "Cooking", "Grandchildren", "A serial", "Gardening", "News", "Old songs"];

type Draft = Omit<Partial<NewParent>, "medicines" | "interests" | "family_names"> & {
  medicines: Array<{ name: string; dose_text?: string; times: string[] }>;
  interests: string[];
  family_names: Record<string, string>;
};

export function AddParentWizard() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0); // 0-4 = steps, 5 = review
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [d, setD] = useState<Draft>({
    language: "mr", voice_gender: "female", window_start: "09:00", window_end: "10:30", days_of_week: [0, 1, 2, 3, 4, 5, 6],
    call_timezone: "Asia/Kolkata", dialect: "", medicines: [], interests: [], family_names: {}, phone_e164: "+91", name: "", honorific: "", child_name: "",
  });
  const [done, setDone] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const lang = getLanguage(d.language ?? "mr");
  const name = d.honorific || d.name || "them";

  function next() {
    const schema = [parentStep1, parentStep2, parentStep3][step];
    if (schema) {
      const r = schema.safeParse(d);
      if (!r.success) {
        setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
        return;
      }
    }
    setErrors({});
    setStep((s) => s + 1);
  }

  const submit = () =>
    start(async () => {
      const r = await addParent(d);
      if (!r.ok) return toast(r.error.message, "danger");
      track("parent_added", { language: d.language });
      setDone(r.data.firstCallTime);
      toast(`First call scheduled for ${r.data.firstCallTime.replace(/^0/, "")} tomorrow.`);
      setTimeout(() => router.push("/app"), 2200);
    });

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="mx-auto mb-6 grid size-20 place-items-center rounded-full bg-accent text-4xl">
          ☎
        </motion.div>
        <h1 className="display text-[31px]">First call scheduled for {done.replace(/^0/, "")} tomorrow.</h1>
        <p className="mt-3 text-muted">We&apos;ll tell you as soon as {name} has agreed to the daily calls.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className={cn("h-1.5 rounded-full transition-colors duration-300", i <= step ? "bg-accent" : "bg-border")} />
            <span className={cn("mt-2 hidden text-xs sm:block", i === step ? "font-semibold" : "text-muted")}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mb-2 text-sm text-muted sm:hidden">
        Step {Math.min(step + 1, 5)} of 5 · {STEPS[Math.min(step, 4)]}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
          {step === 0 && (
            <Section title="Who are we calling?" hint="Haalo will use the name and title the way you'd say it at home.">
              <Field label="Their name" error={errors.name}>
                <Input value={d.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Shobha" autoFocus />
              </Field>
              <div role="group" aria-labelledby="honorific-label" className="space-y-1.5">
                <span id="honorific-label" className="text-sm font-medium">
                  How Haalo should address them
                </span>
                <div className="flex flex-wrap gap-2">
                  {lang.honorifics.map((h) => (
                    <button key={h} type="button" aria-pressed={d.honorific === h} onClick={() => set({ honorific: h })} className={cn("rounded-full border px-4 py-2", d.honorific === h ? "border-text bg-text text-bg" : "border-border bg-surface")}>
                      {h}
                    </button>
                  ))}
                </div>
                <Input aria-label="Or type your own" className="mt-2" value={d.honorific ?? ""} onChange={(e) => set({ honorific: e.target.value })} placeholder="Or type your own" />
                {errors.honorific ? <span className="block text-sm text-danger">{errors.honorific}</span> : null}
              </div>
              <Field label="Your name, as they know you" hint={"Haalo says \"Riya asked me to call you\" on the first call."}>
                <Input value={d.child_name ?? ""} onChange={(e) => set({ child_name: e.target.value })} placeholder="Riya" />
              </Field>
              <Field label="Their phone number" error={errors.phone_e164} hint="With the country code, e.g. +91 98765 43210">
                <Input inputMode="tel" value={d.phone_e164 ?? ""} onChange={(e) => set({ phone_e164: e.target.value.replace(/[\s-]/g, "") })} />
              </Field>
            </Section>
          )}

          {step === 1 && (
            <Section title="Which language do they think in?" hint="Tap a voice to hear how Haalo will greet them.">
              <div className="grid gap-2 sm:grid-cols-2">
                {selectableLanguages.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => set({ language: l.code, honorific: l.honorifics.includes(d.honorific ?? "") ? d.honorific : undefined })}
                    className={cn("flex items-center justify-between rounded-row border px-4 py-3 text-left", d.language === l.code ? "border-text bg-surface" : "border-border bg-surface/60")}
                    aria-pressed={d.language === l.code}
                  >
                    <span>
                      <span className="display block text-xl">{l.native_name}</span>
                      <span className="text-sm text-muted">{l.name}</span>
                    </span>
                    {l.status === "preview" ? <Chip>Preview</Chip> : null}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Voice</p>
                <div className="flex gap-2">
                  {(["female", "male"] as const).map((g) => (
                    <VoiceChip key={g} lang={lang.code} gender={g} selected={d.voice_gender === g} onSelect={() => set({ voice_gender: g })} />
                  ))}
                </div>
              </div>
              <Field label="Dialect or region (optional)" hint="e.g. Pune, Kolhapuri, Konkan. Helps Haalo sound familiar.">
                <Input value={d.dialect ?? ""} onChange={(e) => set({ dialect: e.target.value })} />
              </Field>
            </Section>
          )}

          {step === 2 && (
            <Section title="When is a good time?" hint={`Haalo will call ${name} once a day inside this window.`}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Earliest" error={errors.window_start}>
                  <Input type="time" value={d.window_start} onChange={(e) => set({ window_start: e.target.value })} />
                </Field>
                <Field label="Latest" error={errors.window_end}>
                  <Input type="time" value={d.window_end} onChange={(e) => set({ window_end: e.target.value })} />
                </Field>
              </div>
              <div role="group" aria-label="Days" className="flex flex-wrap gap-2">
                {DAYS.map((day, i) => (
                  <button key={day} type="button" aria-pressed={d.days_of_week?.includes(i)} onClick={() => set({ days_of_week: d.days_of_week?.includes(i) ? d.days_of_week.filter((x) => x !== i) : [...(d.days_of_week ?? []), i].sort() })}
                    className={cn("size-12 rounded-full border text-sm font-medium", d.days_of_week?.includes(i) ? "border-text bg-text text-bg" : "border-border bg-surface")}>
                    {day}
                  </button>
                ))}
              </div>
              {errors.days_of_week ? <p className="text-sm text-danger">{errors.days_of_week}</p> : null}
            </Section>
          )}

          {step === 3 && <MedicinesStep d={d} set={set} name={name} />}
          {step === 4 && <LovesStep d={d} set={set} name={name} />}

          {step === 5 && (
            <Section title="Ready to schedule the first call?" hint={`The first call introduces Haalo as an AI assistant set up by you, and asks ${name} for permission. If they say no, calls stop and you'll be told.`}>
              <dl className="divide-y divide-border rounded-card bg-surface px-5">
                <Line k="Name" v={`${d.name} (${d.honorific})`} />
                <Line k="Phone" v={d.phone_e164 ?? ""} />
                <Line k="Language" v={`${lang.native_name}, ${d.voice_gender} voice${d.dialect ? `, ${d.dialect}` : ""}`} />
                <Line k="Calls" v={`${(d.window_start ?? "").slice(0, 5)} to ${(d.window_end ?? "").slice(0, 5)}, ${d.days_of_week?.length === 7 ? "every day" : d.days_of_week?.map((i) => DAYS[i]).join(", ")}`} />
                <Line k="Medicines" v={d.medicines.length ? d.medicines.map((m) => m.name).join(", ") : "None added"} />
                <Line k="Loves" v={d.interests.length ? d.interests.join(", ") : "Not added"} />
              </dl>
            </Section>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => (step === 0 ? router.push("/app") : setStep((s) => s - 1))}>
          Back
        </Button>
        {step < 5 ? (
          <Button size="lg" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button size="lg" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-5 animate-spin" /> : null} Schedule first call
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="display text-[25px] md:text-[31px]">{title}</h1>
        {hint ? <p className="prose-limit mt-2 text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
const Line = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-4 py-3">
    <dt className="w-24 shrink-0 text-muted">{k}</dt>
    <dd className="flex-1">{v}</dd>
  </div>
);

function VoiceChip({ lang, gender, selected, onSelect }: { lang: string; gender: "female" | "male"; selected: boolean; onSelect: () => void }) {
  const [loading, setLoading] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  return (
    <div className={cn("flex items-center gap-2 rounded-full border py-1 pl-4 pr-1", selected ? "border-text bg-surface" : "border-border")}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="pr-1 capitalize">
        {gender}
      </button>
      <button
        type="button"
        aria-label={`Hear the ${gender} voice`}
        className="grid size-9 place-items-center rounded-full bg-accent text-on-accent"
        onClick={async () => {
          onSelect();
          setLoading(true);
          try {
            audio.current?.pause();
            audio.current = new Audio(`${VOICE_URL}/tts/sample?lang=${lang}&gender=${gender}`);
            await audio.current.play();
          } catch {
            /* preview is a nicety; the wizard works without it */
          }
          setLoading(false);
        }}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      </button>
    </div>
  );
}

function MedicinesStep({ d, set, name }: { d: Draft; set: (p: Partial<Draft>) => void; name: string }) {
  const [medName, setMedName] = useState("");
  const [time, setTime] = useState("morning");
  const add = () => {
    if (!medName.trim()) return;
    set({ medicines: [...d.medicines, { name: medName.trim(), times: [time] }] });
    setMedName("");
  };
  return (
    <Section title="Any medicines to ask about?" hint={`Haalo will gently ask whether ${name} has taken them. It never gives medical advice. Skip this if you like.`}>
      <div className="flex gap-2">
        <Input value={medName} onChange={(e) => setMedName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="BP tablet" />
        <select value={time} onChange={(e) => setTime(e.target.value)} className="rounded-input border border-border bg-surface px-3" aria-label="When">
          {["morning", "afternoon", "evening", "night"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Button type="button" onClick={add} variant="secondary" aria-label="Add medicine">
          <Plus className="size-5" />
        </Button>
      </div>
      <ul className="space-y-2">
        {d.medicines.map((m, i) => (
          <li key={i} className="flex items-center gap-3 rounded-row bg-surface px-4 py-3">
            <span className="flex-1">
              {m.name} <span className="text-muted">· {m.times.join(", ")}</span>
            </span>
            <button aria-label={`Remove ${m.name}`} onClick={() => set({ medicines: d.medicines.filter((_, j) => j !== i) })}>
              <X className="size-4 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">A photo of the prescription is for your own reference and is never sent to Haalo&apos;s AI.</p>
    </Section>
  );
}

function LovesStep({ d, set, name }: { d: Draft; set: (p: Partial<Draft>) => void; name: string }) {
  const [custom, setCustom] = useState("");
  const [fname, setFname] = useState("");
  const [frel, setFrel] = useState("");
  const toggle = (i: string) => set({ interests: d.interests.includes(i) ? d.interests.filter((x) => x !== i) : [...d.interests, i] });
  return (
    <Section title={`What does ${name} love talking about?`} hint="These become the conversation starters, so the call feels like a friend, not a form.">
      <div className="flex flex-wrap gap-2">
        {[...INTEREST_SUGGESTIONS, ...d.interests.filter((i) => !INTEREST_SUGGESTIONS.includes(i))].map((i) => (
          <button key={i} type="button" aria-pressed={d.interests.includes(i)} onClick={() => toggle(i)} className={cn("rounded-full border px-4 py-2", d.interests.includes(i) ? "border-text bg-text text-bg" : "border-border bg-surface")}>
            {i}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Something else" onKeyDown={(e) => e.key === "Enter" && custom.trim() && (e.preventDefault(), toggle(custom.trim()), setCustom(""))} />
        <Button type="button" variant="secondary" onClick={() => custom.trim() && (toggle(custom.trim()), setCustom(""))} aria-label="Add interest">
          <Plus className="size-5" />
        </Button>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Key family names (so Haalo says them right)</p>
        <div className="flex gap-2">
          <Input value={frel} onChange={(e) => setFrel(e.target.value)} placeholder="grandson" />
          <Input value={fname} onChange={(e) => setFname(e.target.value)} placeholder="Aarav" />
          <Button type="button" variant="secondary" aria-label="Add family name" onClick={() => frel && fname && (set({ family_names: { ...d.family_names, [frel]: fname } }), setFrel(""), setFname(""))}>
            <Plus className="size-5" />
          </Button>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {Object.entries(d.family_names).map(([k, v]) => (
            <li key={k}>
              <Chip>
                {k}: {v}
              </Chip>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
