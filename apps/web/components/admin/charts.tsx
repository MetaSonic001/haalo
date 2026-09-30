/** Tiny dependency-free SVG charts. Text alternatives are provided as tables via sr-only. */

export function BarChart({ data, label, format = (n: number) => String(n) }: { data: Array<{ x: string; y: number }>; label: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.y));
  const w = 520, h = 140, gap = 6;
  const bw = data.length ? (w - gap * (data.length - 1)) / data.length : w;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 22}`} role="img" aria-label={label} className="w-full">
        {data.map((d, i) => {
          const bh = (d.y / max) * h;
          return (
            <g key={d.x}>
              <rect x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx="6" fill="var(--accent)" />
              <text x={i * (bw + gap) + bw / 2} y={h + 16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                {d.x.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.x}>
              <th>{d.x}</th>
              <td>{format(d.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function LineChart({ data, label, goal, unit = "ms" }: { data: Array<{ x: string; y: number | null }>; label: string; goal?: number; unit?: string }) {
  const pts = data.filter((d): d is { x: string; y: number } => d.y != null);
  const max = Math.max(goal ?? 0, ...pts.map((d) => d.y), 1);
  const w = 520, h = 140;
  const px = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * (w - 8) + 4 : w / 2);
  const py = (v: number) => h - (v / max) * (h - 8) - 4;
  const path = data.map((d, i) => (d.y == null ? null : `${px(i)},${py(d.y)}`)).filter(Boolean).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 22}`} role="img" aria-label={label} className="w-full">
        {goal ? (
          <g>
            <line x1="0" x2={w} y1={py(goal)} y2={py(goal)} stroke="var(--danger)" strokeDasharray="4 4" strokeOpacity=".6" />
            <text x={w - 4} y={py(goal) - 4} textAnchor="end" fontSize="11" fill="var(--danger)">
              budget {goal}
              {unit}
            </text>
          </g>
        ) : null}
        <polyline points={path} fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (d.y == null ? null : <circle key={d.x} cx={px(i)} cy={py(d.y)} r="3.5" fill="var(--accent)" stroke="var(--text)" />))}
        {data.map((d, i) => (
          <text key={d.x + "l"} x={px(i)} y={h + 16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
            {d.x.slice(5)}
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.x}>
              <th>{d.x}</th>
              <td>{d.y ?? "no data"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
