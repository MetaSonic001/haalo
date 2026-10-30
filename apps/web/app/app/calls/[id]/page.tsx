import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { loadCall } from "@/lib/data";
import { fmtDay, fmtDuration, fmtTime } from "@/lib/format";
import { MoodBadge, moodSentence } from "@/components/app/mood";
import { Transcript } from "@/components/app/transcript";
import { Chip } from "@/components/ui/chip";

export default async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireViewer();
  const data = await loadCall(id);
  if (!data) notFound();
  const { call, summary, turns, parent } = data;
  const name = parent.honorific || parent.name;
  const d = summary?.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/app/calls?p=${parent.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> All calls
      </Link>

      <header className="rounded-card bg-surface p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="display text-[25px] md:text-[31px]">{summary ? moodSentence(name, summary.mood) : `Call with ${name}`}</h1>
            <p className="mt-1 text-muted">
              {fmtDay(call.started_at ?? call.created_at)} at {fmtTime(call.started_at)} · {fmtDuration(call.duration_s)}
            </p>
          </div>
          {summary ? <MoodBadge mood={summary.mood} /> : <Chip>{call.status.replace("_", " ")}</Chip>}
        </div>
        {summary ? <p className="prose-limit mt-5 text-[17px] leading-relaxed">{summary.summary_for_family}</p> : null}
        {call.status === "failed" && call.error_detail ? <p className="mt-4 rounded-row bg-danger-bg px-4 py-3 text-danger">{call.error_detail}</p> : null}
      </header>

      {d ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Medicines">
            {d.meds.length === 0 ? <p className="text-muted">Nothing about medicines came up.</p> : null}
            <ul className="space-y-2">
              {d.meds.map((m) => (
                <li key={m.name} className="flex items-center gap-3">
                  {m.taken ? <Check className="size-5 text-good" strokeWidth={3} /> : <Circle className="size-5 text-muted" />}
                  <span>
                    {m.name} <span className="text-muted">· {m.taken ? "taken" : "not yet"}</span>
                    {m.note ? <span className="block text-sm text-muted">{m.note}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">
              Ate: {d.ate === true ? "yes" : d.ate === false ? "not yet" : "unclear"} · Sleep: {d.slept}
            </p>
          </Panel>
          <Panel title="Highlights">
            <List items={d.highlights} empty="No highlights this time." />
          </Panel>
          <Panel title="Complaints">
            <List items={d.complaints} empty="None mentioned." />
          </Panel>
          <Panel title="Sneha will follow up on">
            <List items={d.follow_ups} empty="Nothing to follow up." />
          </Panel>
        </div>
      ) : null}

      {turns.length > 0 ? <Transcript callId={call.id} turns={turns} parentName={name} /> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-6">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i}>· {i}</li>
      ))}
    </ul>
  );
}
