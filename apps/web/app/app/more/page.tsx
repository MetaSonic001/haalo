import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { loadFamily } from "@/lib/data";
import { pickParent } from "@/lib/parent";
import { isDemoSession } from "@/lib/demo";
import { PageHeader } from "@/components/app/page-header";
import { moreLinks } from "@/components/app/nav-items";

/** The phone-sized home for everything that does not fit in the bottom bar. */
export default async function MorePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const viewer = await requireViewer();
  const fam = await loadFamily(viewer.id);
  const parent = pickParent(fam, p);
  const demo = await isDemoSession();
  const q = parent && fam.parents.length > 1 ? `?p=${parent.id}` : "";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Everything Heartline does" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {moreLinks
          .filter((l) => !l.demoOnly || demo || process.env.NODE_ENV !== "production")
          .map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link href={`${href}${q}`} className="flex items-start gap-4 rounded-card bg-surface p-5 transition-colors hover:bg-surface-alt">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bg">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-lg font-semibold">{label}</span>
                  <span className="block text-muted">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
