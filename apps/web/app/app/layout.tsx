import { Suspense } from "react";
import type { Metadata } from "next";
import { ensureProfile, requireViewer } from "@/lib/auth";
import { loadFamily, loadFlags } from "@/lib/data";
import { AppShell } from "@/components/app/shell";
import { isDemoSession } from "@/lib/demo";

export const metadata: Metadata = { title: "Family dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  await ensureProfile(viewer);
  const fam = await loadFamily(viewer.id);
  const flags = await loadFlags(fam.parents.map((p) => p.id));
  const workspace = await isDemoSession();
  return (
    <Suspense>
      <AppShell
        parents={fam.parents.map((p) => ({ id: p.id, name: p.name, honorific: p.honorific }))}
        openAlerts={flags.filter((f) => f.status === "open").length}
        viewerName={viewer.name || viewer.email}
        demo={viewer.demo || fam.demo}
        workspace={workspace}
        showLive={workspace || process.env.NODE_ENV !== "production"}
        isAdmin={viewer.isAdmin}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
