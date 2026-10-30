import { notFound } from "next/navigation";
import { getLanguage } from "@haalo/shared";
import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { isDemoSession } from "@/lib/demo";
import { NoParent, PageHeader } from "@/components/app/page-header";
import { LiveConsole } from "@/components/app/care/live-console";

export const metadata = { title: "Live demo" };

/** Talk to Sneha as one of the demo parents, from the browser, and watch what it does. Demo workspace (or local development) only. */
export default async function LivePage() {
  const viewer = await requireViewer();
  const demo = await isDemoSession();
  if (!demo && process.env.NODE_ENV === "production") notFound();
  const fam = await loadFamily(viewer.id);
  if (fam.parents.length === 0) return <NoParent />;
  const parents = fam.parents.map((p) => ({ id: p.id, name: p.name, honorific: p.honorific, language: p.language, languageName: getLanguage(p.language).name }));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Live demo" sub="Be the parent. Pick who you are, say something, and watch Sneha respond in their language while the family dashboard updates behind it." />
      <LiveConsole parents={parents} />
    </div>
  );
}
