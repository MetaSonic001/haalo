import type { Vital } from "@haalo/db";

interface Props {
  title: string;
  unit: string;
  series: Array<{ name: string; color: string; points: Array<{ t: number; v: number; flagged: boolean }> }>;
  band?: [number, number];
  days: number;
}

/** A small dependency-free line chart. Flagged readings get a red ring; the usual range is a soft band. */
export function VitalsChart({ title, unit, series, band, days }: Props) {
  const W = 640;
  const H = 190;
  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const t1 = Date.now();
  const t0 = t1 - days * 86_400_000;
  const vals = all.map((p) => p.v).concat(band ?? []);
  const lo = Math.floor((Math.min(...vals) - 6) / 10) * 10;
  const hi = Math.ceil((Math.max(...vals) + 6) / 10) * 10;
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [lo, lo + (hi - lo) / 3, lo + (2 * (hi - lo)) / 3, hi].map(Math.round);
  const latest = series.map((s) => s.points.at(-1)).filter(Boolean);

  return (
    <figure className="rounded-card bg-surface p-5">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted">
          Latest {latest.map((p) => Math.round(p!.v)).join(" / ")} {unit}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}, last ${days} days`}>
        {band ? <rect x={pad.l} width={W - pad.l - pad.r} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="color-mix(in oklab, var(--good) 13%, transparent)" /> : null}
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} stroke="var(--border)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {tk}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={pad.l + f * (W - pad.l - pad.r)} y={H - 6} fontSize="11" fill="var(--text-muted)" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>
            {f === 1 ? "today" : `${Math.round(days * (1 - f))}d ago`}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} />
            {s.points.map((p) => (
              <g key={p.t}>
                {p.flagged ? <circle cx={x(p.t)} cy={y(p.v)} r="8" fill="none" stroke="var(--danger)" strokeWidth="2" /> : null}
                <circle cx={x(p.t)} cy={y(p.v)} r="3.5" fill={s.color} />
              </g>
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
        {band ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-good/20 ring-1 ring-border" /> usual range
          </span>
        ) : null}
        {all.some((p) => p.flagged) ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full ring-2 ring-danger" /> told the family
          </span>
        ) : null}
      </div>
    </figure>
  );
}

export function toSeries(vitals: Vital[], kind: Vital["kind"], pick: "value" | "value2" = "value") {
  return vitals
    .filter((v) => v.kind === kind && (pick === "value" || v.value2 !== null))
    .map((v) => ({ t: new Date(v.measured_at).getTime(), v: pick === "value" ? v.value : (v.value2 as number), flagged: v.flagged }));
}
