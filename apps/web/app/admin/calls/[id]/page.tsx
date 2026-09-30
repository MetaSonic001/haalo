import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loadAdminCall } from "@/lib/admin-data";
import { CallReview, TranscriptEditor } from "@/components/admin/call-review";
import { Chip } from "@/components/ui/chip";
import { fmtDay, fmtDuration, fmtTime } from "@/lib/format";

export default async function AdminCall({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadAdminCall(id);
  if (!data) notFound();
  const { call, turns, parent, review } = data;
  const cost = call.cost_breakdown as Record<string, number>;

  return (
    <div className="space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Overview
      </Link>
      <header className="rounded-card bg-surface p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-[25px]">{parent?.name ?? "Demo call"}</h1>
          <Chip tone={call.status === "completed" ? "good" : call.status === "failed" ? "danger" : "neutral"}>{call.status.replace("_", " ")}</Chip>
          {call.block_reason ? <Chip tone="danger">{call.block_reason.replace(/_/g, " ")}</Chip> : null}
        </div>
        <p className="mt-1 text-muted">
          {fmtDay(call.started_at ?? call.created_at)} {fmtTime(call.started_at)} · {fmtDuration(call.duration_s)} · {call.direction}
        </p>
        {call.error_detail ? <p className="mt-3 rounded-row bg-danger-bg px-4 py-3 text-danger">{call.error_detail}</p> : null}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {[
            ["Language", call.language],
            ["STT", call.stt_provider],
            ["TTS", call.tts_provider],
            ["LLM", call.llm_model],
            ["p50", call.latency_p50_ms ? `${call.latency_p50_ms} ms` : "-"],
            ["p95", call.latency_p95_ms ? `${call.latency_p95_ms} ms` : "-"],
            ["Telephony", call.provider],
            ["Cost", cost?.total != null ? `₹${cost.total}` : "-"],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium">{v ?? "-"}</dd>
            </div>
          ))}
        </dl>
        {cost && Object.keys(cost).length > 1 ? (
          <p className="mt-3 text-sm text-muted">
            {cost.telephony_minutes} telephony min · {cost.stt_seconds}s STT · {cost.llm_tokens} LLM tokens · {cost.tts_chars} TTS chars
          </p>
        ) : null}
      </header>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <TranscriptEditor turns={turns} />
        <CallReview callId={call.id} initial={review} />
      </div>
    </div>
  );
}
