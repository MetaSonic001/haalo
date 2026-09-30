import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { loadFamily, loadToday } from "@/lib/data";
import { greeting, pickParent } from "@/lib/parent";
import { fmtClock, fmtDay, fmtDuration } from "@/lib/format";
import { StatusCard } from "@/components/app/status-card";
import { MoodBadge } from "@/components/app/mood";
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
        <p className="mt-3 text-muted">It takes about three minutes. Haalo will ring their ordinary phone, no app needed.</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/app/parents/new">
            <Plus className="size-5" /> Add a parent
          </Link>
        </Button>
      </div>
    );
  }

  const today = await loadToday(parent.id);
  const name = parent.honorific || parent.name;
  const callTime = fmtClock(today.schedule?.window_start).replace(" am", "").replace(" pm", "") || "9:00";
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
          href={`/app/alerts?p=${parent.id}`}
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
        medicines={today.medicines}
        callTime={callTime}
      />

      {today.recent.length > 0 ? (
        <section aria-labelledby="recent-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-h" className="text-xl font-semibold">
              Recent calls
            </h2>
            <Link href={`/app/calls?p=${parent.id}`} className="text-sm font-medium text-muted hover:text-text">
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
