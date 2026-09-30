import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { LogoMark } from "@/components/landing/nav";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/prompts", label: "Prompts and languages" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/app", label: "Family app" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border py-5">
        <Link href="/admin" className="flex items-center gap-2.5">
          <LogoMark className="size-7" />
          <span className="display text-lg">Haalo admin</span>
        </Link>
        <nav aria-label="Admin" className="flex flex-wrap gap-4 text-sm font-medium text-muted">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-text">
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-sm text-muted">{viewer.email}</span>
      </header>
      <main id="main" className="pt-8">
        {children}
      </main>
    </div>
  );
}
