import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { loadFamily, loadToday } from "@/lib/data";
import { pickParent } from "@/lib/parent";
import { fmtDay, fmtDuration, fmtTime } from "@/lib/format";
import { MoodBadge } from "@/components/app/mood";
import { Chip } from "@/components/ui/chip";
import { Row } from "@/components/ui/card";

const statusText: Record<string, string> = {
  queued: "Scheduled", dialing: "Calling", in_progress: "On the call", completed: "Completed", no_answer: "No answer",
  no_response: "Didn't respond", failed: "Couldn't connect", missed: "Missed",
};

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  if (!parent) return <p className="text-muted">Add a parent to see their calls.</p>;
  const { recent } = await loadToday(parent.id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-[31px] md:text-[39px]">Calls</h1>
      <p className="mt-1 text-muted">Every conversation Sneha has had with {parent.honorific || parent.name}.</p>
      {recent.length === 0 ? (
        <p className="mt-10 rounded-card bg-surface p-8 text-muted">No calls yet. The first one will appear here after Sneha rings.</p>
      ) : (
        <ul className="mt-8 space-y-2">
          {recent.map((c) => (
            <li key={c.id}>
              <Link href={`/app/calls/${c.id}`}>
                <Row className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 transition-colors hover:bg-surface-alt">
                  <div className="w-28 shrink-0">
                    <p className="font-medium">{fmtDay(c.started_at ?? c.created_at)}</p>
                    <p className="text-sm text-muted">{fmtTime(c.started_at ?? c.scheduled_for)}</p>
                  </div>
                  <p className="min-w-0 flex-1 basis-56 text-muted">{c.summary?.summary_for_family ?? c.error_detail ?? statusText[c.status]}</p>
                  {c.summary ? <MoodBadge mood={c.summary.mood} /> : <Chip tone={c.status === "failed" ? "danger" : "neutral"}>{statusText[c.status]}</Chip>}
                  <span className="w-14 text-right text-sm text-muted">{fmtDuration(c.duration_s)}</span>
                </Row>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
