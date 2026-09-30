import Link from "next/link";
import { loadAdminOverview } from "@/lib/admin-data";
import { BarChart, LineChart } from "@/components/admin/charts";
import { Chip } from "@/components/ui/chip";
import { fmtDay, fmtTime } from "@/lib/format";
import { ResolveButton } from "@/components/admin/resolve-button";

const stat = (label: string, value: string, hint?: string) => (
  <div className="rounded-card bg-surface p-5">
    <p className="text-sm text-muted">{label}</p>
    <p className="display mt-1 text-[31px]">{value}</p>
    {hint ? <p className="text-sm text-muted">{hint}</p> : null}
  </div>
);

export default async function AdminHome() {
  const o = await loadAdminOverview();
  const money = (n: number) => `₹${n.toFixed(2)}`;
  return (
    <div className="space-y-10">
      {o.demo ? <p className="rounded-row bg-warn-bg px-4 py-3 text-warn">Demo data. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env for live numbers.</p> : null}

      <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stat("Calls (14 days)", String(o.totals.calls))}
        {stat("Answer rate", `${Math.round(o.totals.answerRate * 100)}%`)}
        {stat("Avg duration", `${Math.round(o.totals.avgDuration / 60)} min`)}
        {stat("p95 latency", o.totals.p95 ? `${o.totals.p95} ms` : "n/a", "goal under 1200 ms on phone")}
        {stat("Cost per completed", money(o.totals.costPerCompleted), "rates come from .env")}
      </section>

      {o.digest ? (
        <section aria-labelledby="digest-h" className="rounded-card bg-surface p-5">
          <h2 id="digest-h" className="text-lg font-semibold">
            Yesterday ({o.digest.day})
          </h2>
          <p className="mt-1 text-muted">
            {o.digest.data.calls_completed} calls completed · answer rate {o.digest.data.answer_rate != null ? `${Math.round(Number(o.digest.data.answer_rate) * 100)}%` : "n/a"} · avg{" "}
            {o.digest.data.avg_duration_s ? `${Math.round(Number(o.digest.data.avg_duration_s) / 60)} min` : "n/a"} · p95 {o.digest.data.p95_latency_ms ?? "n/a"} ms ·{" "}
            {o.digest.data.flags} flags ({o.digest.data.emergency_flags} emergency) · cost per completed {money(Number(o.digest.data.cost_per_completed ?? 0))}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="flags-h">
        <h2 id="flags-h" className="mb-3 text-xl font-semibold">
          Open flags {o.flags.length ? `(${o.flags.length})` : ""}
        </h2>
        {o.flags.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No open flags.</p> : null}
        <ul className="space-y-2">
          {o.flags.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-row bg-surface px-4 py-3">
              <Chip tone={f.severity === "emergency" || f.severity === "high" ? "danger" : "warn"}>{f.severity}</Chip>
              <span className="font-medium capitalize">{f.category.replace(/_/g, " ")}</span>
              <span className="text-muted">{f.parent_name}</span>
              {f.evidence_quote ? <span className="min-w-0 flex-1 basis-60 truncate text-muted">&ldquo;{f.evidence_quote}&rdquo;</span> : null}
              <span className="text-sm text-muted">{fmtDay(f.created_at)}, {fmtTime(f.created_at)}</span>
              {f.call_id ? (
                <Link href={`/admin/calls/${f.call_id}`} className="text-sm font-medium underline">
                  Review call
                </Link>
              ) : null}
              <ResolveButton id={f.id} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="live-h">
        <h2 id="live-h" className="mb-3 text-xl font-semibold">
          Live calls
        </h2>
        {o.live.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No calls in progress.</p> : null}
        <ul className="space-y-2">
          {o.live.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-row bg-surface px-4 py-3">
              <span className="size-2.5 animate-pulse rounded-full bg-accent" aria-hidden />
              <span className="font-medium">{c.parent_name}</span>
              <Chip tone="accent">{c.status.replace("_", " ")}</Chip>
              <span className="text-sm text-muted">{c.language} · {c.provider}</span>
              <Link href={`/admin/calls/${c.id}`} className="ml-auto text-sm font-medium underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Charts">
        <div className="rounded-card bg-surface p-6">
          <h2 className="mb-3 text-lg font-semibold">Calls per day</h2>
          <BarChart label="Calls per day" data={o.daily.map((d) => ({ x: d.day, y: d.calls }))} />
        </div>
        <div className="rounded-card bg-surface p-6">
          <h2 className="mb-3 text-lg font-semibold">p95 latency per day</h2>
          <LineChart label="p95 latency per day" goal={1200} data={o.daily.map((d) => ({ x: d.day, y: d.p95 }))} />
        </div>
        <div className="rounded-card bg-surface p-6 md:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Cost per day</h2>
          <BarChart label="Cost per day" data={o.daily.map((d) => ({ x: d.day, y: d.cost }))} format={money} />
        </div>
      </section>
    </div>
  );
}
