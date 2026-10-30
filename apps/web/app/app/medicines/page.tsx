import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { adherenceByDay, loadDoses, loadMedicinesFull } from "@/lib/care-data";
import { pickParent } from "@/lib/parent";
import { NoParent, PageHeader } from "@/components/app/page-header";
import { DoseList } from "@/components/app/care/dose-list";
import { AdherenceGrid } from "@/components/app/care/adherence-grid";
import { MedicineManager } from "@/components/app/care/medicine-manager";
import { RemindButton } from "@/components/app/care/remind-button";

export default async function MedicinesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  if (!parent) return <NoParent />;
  const [doses, medicines] = await Promise.all([loadDoses(parent.id, 8), loadMedicinesFull(parent.id)]);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
  const todayKey = fmt.format(new Date());
  const today = doses.filter((d) => fmt.format(new Date(d.due_at)) === todayKey);
  const who = parent.honorific || parent.name;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader
        title="Medicines"
        who={`${parent.name} · ${who}`}
        sub={`Sneha reminds ${who} at each dose time, asks them to confirm, tries once more, and tells you if it still isn't confirmed.`}
      />

      <section aria-labelledby="today-h" className="rounded-card bg-surface p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="today-h" className="text-xl font-semibold">
            Today
          </h2>
          <RemindButton parentId={parent.id} name={who} demo={fam.demo || viewer.demo} />
        </div>
        <DoseList key={today.map((d) => d.id + d.status).join()} doses={today} />
      </section>

      <section aria-labelledby="week-h" className="rounded-card bg-surface p-5 md:p-6">
        <h2 id="week-h" className="mb-4 text-xl font-semibold">
          This week
        </h2>
        <AdherenceGrid days={adherenceByDay(doses, 7)} />
      </section>

      <section aria-labelledby="meds-h">
        <h2 id="meds-h" className="mb-3 text-xl font-semibold">
          Medicine list
        </h2>
        <MedicineManager parentId={parent.id} medicines={medicines} />
      </section>
    </div>
  );
}
