import Link from "next/link";
import { Activity, AlertTriangle, CalendarDays, ChevronRight, Droplets, MessageCircleHeart, Plus, TrendingDown } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { isDemoSession } from "@/lib/demo";
import { loadFamily, loadToday } from "@/lib/data";
import { loadAppointments, loadDoses, loadInsights, loadMessages, loadVitals } from "@/lib/care-data";
import { greeting, pickParent } from "@/lib/parent";
import { fmtClock, fmtDay, fmtDuration, fmtTime } from "@/lib/format";
import { StatusCard } from "@/components/app/status-card";
import { MoodBadge } from "@/components/app/mood";
import { DoseList } from "@/components/app/care/dose-list";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Row } from "@/components/ui/card";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);

  if (!parent) {
    return (
      <div className="mx-auto max-w-xl pt-10 text-center">
        <h1 className="display text-[31px]">Let&apos;s set up the first call.</h1>
        <p className="mt-3 text-muted">It takes about three minutes. Sneha will ring their ordinary phone, no app needed.</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/app/parents/new">
            <Plus className="size-5" /> Add a parent
          </Link>
        </Button>
      </div>
    );
  }

  const [today, doses, vitals, { insights }, appointments, messages] = await Promise.all([
    loadToday(parent.id),
    loadDoses(parent.id, 2),
    loadVitals(parent.id, 14),
    loadInsights(parent.id),
    loadAppointments([parent.id]),
    loadMessages([parent.id]),
  ]);
  const name = parent.honorific || parent.name;
  const callTime = fmtClock(today.schedule?.window_start).replace(" am", "").replace(" pm", "") || "9:00";
  const q = fam.parents.length > 1 ? `?p=${parent.id}` : "";

  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
  const todayKey = fmt.format(new Date());
  const todayDoses = doses.filter((d) => fmt.format(new Date(d.due_at)) === todayKey);
  const lastBp = [...vitals].reverse().find((v) => v.kind === "bp");
  const lastSugar = [...vitals].reverse().find((v) => v.kind === "sugar");
  const topInsight = [...insights].sort((a, b) => ({ concern: 0, watch: 1, info: 2 })[a.severity] - ({ concern: 0, watch: 1, info: 2 })[b.severity])[0];
  const nextAppt = appointments.find((a) => new Date(a.at).getTime() > Date.now());
  const queued = messages.filter((m) => m.status === "queued").length;

  const consentChip =
    parent.consent_status === "granted" ? (
      <Chip tone="good">Agreed to daily calls</Chip>
    ) : parent.consent_status === "declined" ? (
      <Chip tone="danger">Declined the calls</Chip>
    ) : (
      <Chip tone="warn">Waiting for permission on the first call</Chip>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[31px] md:text-[39px]">{greeting(viewer.name)}</h1>
          <p className="mt-1 text-muted">
            {parent.name} · {name}
          </p>
        </div>
        {consentChip}
      </header>

      {today.openFlags.length > 0 ? (
        <Link
          href={`/app/alerts${q}`}
          className="flex items-center gap-3 rounded-row bg-danger-bg px-4 py-3 text-danger transition-colors hover:brightness-95"
        >
          <AlertTriangle className="size-5 shrink-0" />
          <span className="flex-1 font-medium">
            {today.openFlags.length === 1 ? "1 alert needs your attention" : `${today.openFlags.length} alerts need your attention`}
          </span>
          <ChevronRight className="size-5" />
        </Link>
      ) : null}

      <StatusCard
        parent={{ id: parent.id, name: parent.name, honorific: parent.honorific, consent_status: parent.consent_status }}
        latest={today.latest ? { id: today.latest.id, started_at: today.latest.started_at, duration_s: today.latest.duration_s, summary: today.latest.summary } : null}
        medicines={todayDoses.length ? [] : today.medicines}
        callTime={callTime}
        workspace={await isDemoSession()}
      />

      {todayDoses.length > 0 ? (
        <section aria-labelledby="doses-h" className="rounded-card bg-surface p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="doses-h" className="text-xl font-semibold">
              Today&apos;s medicines
            </h2>
            <Link href={`/app/medicines${q}`} className="text-sm font-medium text-muted hover:text-text">
              Details
            </Link>
          </div>
          <DoseList key={todayDoses.map((d) => d.id + d.status).join()} doses={todayDoses} compact />
        </section>
      ) : null}

      {topInsight && topInsight.severity !== "info" ? (
        <Link href={`/app/insights${q}`} className="flex items-start gap-3 rounded-card bg-warn-bg p-5 text-warn transition-colors hover:brightness-95">
          <TrendingDown className="mt-0.5 size-5 shrink-0" />
          <span className="flex-1">
            <span className="block text-lg font-semibold">{topInsight.title}</span>
            <span className="block text-[15px] opacity-90">{topInsight.body}</span>
          </span>
          <ChevronRight className="mt-0.5 size-5" />
        </Link>
      ) : null}

      {lastBp || lastSugar || nextAppt || queued > 0 ? (
        <section aria-label="At a glance" className="grid gap-3 sm:grid-cols-2">
          {lastBp ? (
            <Link href={`/app/health${q}`} className="flex items-center gap-3 rounded-row bg-surface px-4 py-3 transition-colors hover:bg-surface-alt">
              <Activity className="size-5 text-muted" />
              <span className="flex-1">
                <span className="block text-sm text-muted">Blood pressure · {fmtDay(lastBp.measured_at)}</span>
                <span className="text-lg font-semibold">
                  {Math.round(lastBp.value)}/{Math.round(lastBp.value2 ?? 0)}
                </span>
              </span>
              {lastBp.flagged ? <Chip tone="danger">Outside range</Chip> : <Chip tone="good">In range</Chip>}
            </Link>
          ) : null}
          {lastSugar ? (
            <Link href={`/app/health${q}`} className="flex items-center gap-3 rounded-row bg-surface px-4 py-3 transition-colors hover:bg-surface-alt">
              <Droplets className="size-5 text-muted" />
              <span className="flex-1">
                <span className="block text-sm text-muted">Blood sugar · {fmtDay(lastSugar.measured_at)}</span>
                <span className="text-lg font-semibold">{Math.round(lastSugar.value)}</span>
              </span>
              {lastSugar.flagged ? <Chip tone="danger">Outside range</Chip> : <Chip tone="good">In range</Chip>}
            </Link>
          ) : null}
          {nextAppt ? (
            <Link href={`/app/calendar${q}`} className="flex items-center gap-3 rounded-row bg-surface px-4 py-3 transition-colors hover:bg-surface-alt">
              <CalendarDays className="size-5 text-muted" />
              <span className="flex-1">
                <span className="block text-sm text-muted">Next appointment</span>
                <span className="font-semibold">{nextAppt.title}</span>
                <span className="block text-sm text-muted">
                  {fmtDay(nextAppt.at)}, {fmtTime(nextAppt.at)}
                </span>
              </span>
            </Link>
          ) : null}
          {queued > 0 ? (
            <Link href={`/app/messages${q}`} className="flex items-center gap-3 rounded-row bg-surface px-4 py-3 transition-colors hover:bg-surface-alt">
              <MessageCircleHeart className="size-5 text-muted" />
              <span className="flex-1">
                <span className="block text-sm text-muted">Waiting for the next call</span>
                <span className="font-semibold">
                  {queued} message{queued === 1 ? "" : "s"} for {name}
                </span>
              </span>
            </Link>
          ) : null}
        </section>
      ) : null}

      {today.recent.length > 0 ? (
        <section aria-labelledby="recent-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-h" className="text-xl font-semibold">
              Recent calls
            </h2>
            <Link href={`/app/calls${q}`} className="text-sm font-medium text-muted hover:text-text">
              See all
            </Link>
          </div>
          <ul className="space-y-2">
            {today.recent.slice(0, 4).map((c) => (
              <li key={c.id}>
                <Link href={`/app/calls/${c.id}`}>
                  <Row className="flex items-center gap-4 transition-colors hover:bg-surface-alt">
                    <div className="w-24 shrink-0 text-sm font-medium">{fmtDay(c.started_at ?? c.created_at)}</div>
                    <div className="min-w-0 flex-1 truncate text-muted">
                      {c.summary?.summary_for_family ?? (c.status === "completed" ? "Summary on its way" : c.status.replace("_", " "))}
                    </div>
                    {c.summary ? <MoodBadge mood={c.summary.mood} /> : <Chip>{c.status.replace("_", " ")}</Chip>}
                    <span className="hidden w-14 text-right text-sm text-muted sm:block">{fmtDuration(c.duration_s)}</span>
                  </Row>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
