import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { loadInsights } from "@/lib/care-data";
import { pickParent } from "@/lib/parent";
import { NoParent, PageHeader } from "@/components/app/page-header";
import { InsightsView } from "@/components/app/care/insights-view";

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  if (!parent) return <NoParent />;
  const { insights, digest } = await loadInsights(parent.id);
  const who = parent.honorific || parent.name;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Trends"
        who={`${parent.name} · ${who}`}
        sub={`Small changes show up over weeks, not in one call. Sneha watches mood, how much ${who} talks, sleep, meals, medicines and blood pressure, and tells you early.`}
      />
      <InsightsView key={parent.id} parent={{ id: parent.id, name: parent.name, honorific: parent.honorific }} insights={insights} digest={digest} />
    </div>
  );
}
