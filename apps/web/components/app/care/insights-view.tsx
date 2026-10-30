"use client";

import { useTransition } from "react";
import { HeartPulse, Info, RefreshCcw, Sparkles, TrendingDown } from "lucide-react";
import type { Insight, WeeklyDigest } from "@haalo/db";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/app/toast";
import { refreshInsights } from "@/app/app/care-actions";

const sev = {
  info: { tone: "good", word: "Good to know", Icon: Sparkles },
  watch: { tone: "warn", word: "Worth watching", Icon: TrendingDown },
  concern: { tone: "danger", word: "Worth a call", Icon: HeartPulse },
} as const;

export function InsightsView({ parent, insights, digest }: { parent: { id: string; name: string; honorific: string }; insights: Insight[]; digest: WeeklyDigest | null }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const who = parent.honorific || parent.name;
  const order = { concern: 0, watch: 1, info: 2 } as const;
  const sorted = [...insights].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="space-y-8">
      {digest?.summary ? (
        <section aria-labelledby="digest-h" className="rounded-card bg-ink p-6 text-white md:p-8">
          <p className="text-sm font-medium text-white/70">This week with {who}</p>
          <h2 id="digest-h" className="sr-only">Weekly note</h2>
          <p className="display mt-2 text-[22px] leading-snug md:text-[26px]">{digest.summary}</p>
          <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-white/60">Calls</dt><dd className="text-xl font-semibold">{digest.data.calls ?? 0}</dd></div>
            <div><dt className="text-white/60">Doses confirmed</dt><dd className="text-xl font-semibold">{digest.data.adherence_pct != null ? `${digest.data.adherence_pct}%` : "-"}</dd></div>
            <div><dt className="text-white/60">Mood</dt><dd className="text-xl font-semibold">{digest.data.avg_mood == null ? "-" : digest.data.avg_mood >= 1.4 ? "Cheerful" : digest.data.avg_mood >= 0.9 ? "Mixed" : "Low"}</dd></div>
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="ins-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="ins-h" className="text-xl font-semibold">What Sneha noticed</h2>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => {
            const r = await refreshInsights(parent.id);
            if (r.ok) toast(`Updated. ${r.data.count} thing${r.data.count === 1 ? "" : "s"} noticed.`);
            else toast(r.error.message, "danger");
          })}>
            <RefreshCcw className={pending ? "size-4 animate-spin" : "size-4"} /> {pending ? "Looking at the calls..." : "Refresh"}
          </Button>
        </div>
        <ul className="space-y-3">
          {sorted.map((i) => {
            const s = sev[i.severity];
            return (
              <li key={i.id} className="rounded-card bg-surface p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={s.tone}><s.Icon className="size-4" /> {s.word}</Chip>
                  <h3 className="text-lg font-semibold">{i.title}</h3>
                </div>
                <p className="prose-limit mt-2 text-[17px]">{i.body}</p>
              </li>
            );
          })}
          {sorted.length === 0 ? <li className="rounded-card bg-surface p-6 text-muted">Sneha needs a few more calls to see a pattern. Trends appear after about a week.</li> : null}
        </ul>
        <p className="mt-4 flex gap-2 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0" /> Sneha compares this week with the weeks before. It never diagnoses: it tells you when a call or a visit might be worth it.</p>
      </section>
    </div>
  );
}
