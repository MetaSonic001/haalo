import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { loadContacts, loadEscalations } from "@/lib/care-data";
import { pickParent } from "@/lib/parent";
import { NoParent, PageHeader } from "@/components/app/page-header";
import { SafetyPanel } from "@/components/app/care/safety-panel";
import { voiceUrl } from "@/lib/voice";

async function telephonyOn(): Promise<boolean> {
  try {
    const r = await fetch(`${voiceUrl()}/health`, { cache: "no-store" });
    return Boolean(((await r.json()) as { telephony: string | null }).telephony);
  } catch {
    return false;
  }
}

export default async function SafetyPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  if (!parent || !fam.familyId) return <NoParent />;
  const [contacts, escalations, telephony] = await Promise.all([loadContacts(fam.familyId), loadEscalations([parent.id]), telephonyOn()]);
  const who = parent.honorific || parent.name;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Safety"
        who={`${parent.name} · ${who}`}
        sub="If something may be seriously wrong, Sneha doesn't send one message and hope. It alerts the family, then calls your emergency contacts one by one until someone says they are on it."
      />
      <SafetyPanel
        familyId={fam.familyId}
        parent={{ id: parent.id, name: parent.name, honorific: parent.honorific }}
        contacts={contacts}
        escalations={escalations}
        telephony={telephony}
      />
    </div>
  );
}
