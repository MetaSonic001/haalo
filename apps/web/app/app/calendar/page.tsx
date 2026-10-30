import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { loadAppointments, loadOccasions } from "@/lib/care-data";
import { pickParent } from "@/lib/parent";
import { NoParent, PageHeader } from "@/components/app/page-header";
import { AppointmentsPanel } from "@/components/app/care/appointments-panel";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  if (!parent) return <NoParent />;
  const [appointments, occasions] = await Promise.all([loadAppointments([parent.id]), loadOccasions(parent.id)]);
  const who = parent.honorific || parent.name;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Calendar" who={`${parent.name} · ${who}`} sub="Doctor visits, tests, festivals and birthdays. Sneha mentions them on the calls so nothing is forgotten." />
      <AppointmentsPanel parent={{ id: parent.id, name: parent.name, honorific: parent.honorific }} appointments={appointments} occasions={occasions} />
    </div>
  );
}
