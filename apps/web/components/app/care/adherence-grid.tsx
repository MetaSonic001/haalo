import { cn } from "@/lib/utils";

interface Day {
  day: string;
  label: string;
  taken: number;
  missed: number;
  open: number;
}

/** Seven small columns, one per day: green for confirmed doses, red for missed, grey for still to come. Words under every column. */
export function AdherenceGrid({ days }: { days: Day[] }) {
  const decided = days.reduce((n, d) => n + d.taken + d.missed, 0);
  const taken = days.reduce((n, d) => n + d.taken, 0);
  const pct = decided ? Math.round((100 * taken) / decided) : null;
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        {days.map((d) => {
          const total = d.taken + d.missed + d.open || 1;
          return (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="flex h-24 w-full max-w-12 flex-col-reverse overflow-hidden rounded-full bg-surface-alt"
                role="img"
                aria-label={`${d.label}: ${d.taken} taken, ${d.missed} missed, ${d.open} still to come`}
              >
                <div className="bg-good" style={{ height: `${(d.taken / total) * 100}%` }} />
                <div className="bg-danger" style={{ height: `${(d.missed / total) * 100}%` }} />
              </div>
              <span className="text-xs font-medium text-muted">{d.label}</span>
            </div>
          );
        })}
      </div>
      <p className={cn("mt-4 text-sm", pct !== null && pct < 75 ? "text-warn" : "text-muted")}>
        {pct === null ? "No doses confirmed yet this week." : `${pct}% of doses confirmed this week (${taken} of ${decided}).`}
      </p>
    </div>
  );
}
