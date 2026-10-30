import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { loadParentToken, loadProofs, loadVitals } from "@/lib/care-data";
import { pickParent } from "@/lib/parent";
import { NoParent, PageHeader } from "@/components/app/page-header";
import { VitalsChart, toSeries } from "@/components/app/care/vitals-chart";
import { ProofsPanel } from "@/components/app/care/proofs-panel";
import { fmtDay, fmtTime } from "@/lib/format";
import { Chip } from "@/components/ui/chip";

const label = { bp: "Blood pressure", sugar: "Blood sugar", weight: "Weight", temperature: "Temperature", spo2: "Oxygen", pulse: "Pulse" } as const;

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  if (!parent) return <NoParent />;
  const [vitals, proofs, token] = await Promise.all([loadVitals(parent.id, 30), loadProofs([parent.id]), loadParentToken(parent.id)]);
  const who = parent.honorific || parent.name;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = token ? `${base}/p/${token}` : null;
  const recent = [...vitals].reverse().slice(0, 8);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader
        title="Health"
        who={`${parent.name} · ${who}`}
        sub={`Readings ${who} mentions on a call, or shows in a photo, are saved here. Sneha only records them and tells you when one is outside the range your family agreed. It never gives medical advice.`}
      />

      {vitals.some((v) => v.kind === "bp") ? (
        <VitalsChart
          title="Blood pressure"
          unit="mmHg"
          days={30}
          band={[90, 140]}
          series={[
            { name: "Top (systolic)", color: "var(--color-ink)", points: toSeries(vitals, "bp") },
            { name: "Bottom (diastolic)", color: "var(--color-marigold)", points: toSeries(vitals, "bp", "value2") },
          ]}
        />
      ) : null}
      {vitals.some((v) => v.kind === "sugar") ? (
        <VitalsChart title="Blood sugar" unit="mg/dL" days={30} band={[70, 180]} series={[{ name: "Fasting sugar", color: "var(--color-ink)", points: toSeries(vitals, "sugar") }]} />
      ) : null}
      {vitals.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-muted">No readings yet. When {who} says &ldquo;my BP is 130 over 85&rdquo; on a call, it shows up here.</p>
      ) : null}

      {recent.length > 0 ? (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-3 text-xl font-semibold">
            Recent readings
          </h2>
          <ul className="space-y-2">
            {recent.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-row bg-surface px-4 py-3">
                <span className="w-36 font-medium">{label[v.kind]}</span>
                <span className="text-lg font-semibold">
                  {v.kind === "bp" ? `${Math.round(v.value)}/${Math.round(v.value2 ?? 0)}` : Math.round(v.value * 10) / 10} <span className="text-sm font-normal text-muted">{v.unit}</span>
                </span>
                {v.flagged ? <Chip tone="danger">Told the family</Chip> : <Chip tone="good">In range</Chip>}
                <span className="ml-auto text-sm text-muted">
                  {v.source === "photo" ? "from a photo · " : ""}
                  {fmtDay(v.measured_at)}, {fmtTime(v.measured_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ProofsPanel parent={{ id: parent.id, name: parent.name, honorific: parent.honorific }} proofs={proofs} link={link} />
    </div>
  );
}
