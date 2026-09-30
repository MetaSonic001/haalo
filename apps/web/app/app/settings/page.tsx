import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { loadFamily, loadSchedule } from "@/lib/data";
import { pickParent } from "@/lib/parent";
import { SettingsPanel } from "@/components/app/settings-panel";
import { Button } from "@/components/ui/button";
import { SignOut } from "@/components/app/sign-out";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-[31px] md:text-[39px]">Settings</h1>
      {parent ? (
        <div className="mt-8">
          <SettingsPanel parent={parent} schedule={await loadSchedule(parent.id)} />
        </div>
      ) : (
        <p className="mt-4 text-muted">Add a parent to manage their schedule and privacy.</p>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <Link href="/app/parents/new">Add another parent</Link>
        </Button>
        {viewer.demo ? null : <SignOut />}
      </div>
    </div>
  );
}
