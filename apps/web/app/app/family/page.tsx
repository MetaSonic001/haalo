import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { FamilyPanel } from "@/components/app/family-panel";

export default async function FamilyPage() {
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  if (!fam.familyId) return <p className="text-muted">Add a parent first, and your family circle will appear here.</p>;
  const me = fam.members.find((m) => m.user_id === viewer.id);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-[31px] md:text-[39px]">Family</h1>
      <p className="mb-8 mt-1 text-muted">Everyone in the circle sees the same calls, and shares the peace of mind.</p>
      <FamilyPanel familyId={fam.familyId} members={fam.members} viewerId={viewer.id} isOwner={fam.demo || me?.role === "owner"} />
    </div>
  );
}
