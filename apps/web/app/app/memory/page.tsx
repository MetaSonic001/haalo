import { Play } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { loadFamily, loadMemoryLane } from "@/lib/data";
import { Chip } from "@/components/ui/chip";
import { fmtDay } from "@/lib/format";
import { Orb } from "@/components/orb";

export default async function MemoryLane() {
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const stories = await loadMemoryLane(fam.parents.map((p) => p.id));
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-[31px] md:text-[39px]">Memory Lane</h1>
      <p className="mb-8 mt-1 text-muted">Stories your parents told Sneha, kept for the family. Sharing needs their permission.</p>
      {stories.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-10 text-center">
          <Orb size={96} />
          <p className="max-w-md text-muted">
            When Aai tells a story worth keeping, and says it&apos;s alright to share, it will appear here with its audio.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {stories.map((s) => (
            <li key={s.id} className="rounded-card bg-surface p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">{fmtDay(s.created_at)}</p>
                <Chip tone={s.share_consent ? "good" : "warn"}>{s.share_consent ? "Shared with permission" : "Not shared yet"}</Chip>
              </div>
              <h2 className="display mt-3 text-xl">{s.title}</h2>
              <p className="mt-2 line-clamp-3 text-muted">{s.transcript}</p>
              {s.audio_path && s.share_consent ? (
                <button className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-medium text-on-accent">
                  <Play className="size-4" /> Listen
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
