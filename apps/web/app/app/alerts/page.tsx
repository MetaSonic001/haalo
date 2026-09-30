import { requireViewer } from "@/lib/auth";
import { loadFamily, loadFlags } from "@/lib/data";
import { FlagList } from "@/components/app/flag-actions";

export default async function AlertsPage() {
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const flags = await loadFlags(fam.parents.map((p) => p.id));
  const parents = Object.fromEntries(fam.parents.map((p) => [p.id, { name: p.name, honorific: p.honorific, phone: p.phone_e164 }]));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-[31px] md:text-[39px]">Alerts</h1>
      <p className="mb-8 mt-1 text-muted">Emergencies come first. Each one shows the exact words that were said.</p>
      <FlagList flags={flags} parents={parents} />
    </div>
  );
}
