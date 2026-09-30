"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Heart, Phone, Settings, Sun, Users } from "lucide-react";
import { LogoMark } from "@/components/landing/nav";
import { ToastProvider } from "./toast";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  parents: Array<{ id: string; name: string; honorific: string }>;
  openAlerts: number;
  viewerName: string;
  demo: boolean;
  isAdmin: boolean;
}

const nav = [
  { href: "/app", label: "Today", icon: Sun },
  { href: "/app/calls", label: "Calls", icon: Phone },
  { href: "/app/alerts", label: "Alerts", icon: Bell },
  { href: "/app/family", label: "Family", icon: Users },
];
const extra = [
  { href: "/app/memory", label: "Memory Lane", icon: Heart },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, parents, openAlerts, viewerName, demo, isAdmin }: Props) {
  const path = usePathname();
  const sp = useSearchParams();
  const selected = sp.get("p") ?? parents[0]?.id;
  const withP = (href: string) => (selected && parents.length > 1 ? `${href}?p=${selected}` : href);
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

  const Item = ({ href, label, icon: Icon }: (typeof nav)[number]) => (
    <Link
      href={withP(href)}
      aria-current={active(href) ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-row px-3 py-2.5 text-[15px] font-medium transition-colors duration-150 md:py-2",
        active(href) ? "bg-surface text-text" : "text-muted hover:text-text",
      )}
    >
      <Icon className="size-5" />
      {label}
      {href === "/app/alerts" && openAlerts > 0 ? (
        <span className="ml-auto grid min-w-6 place-items-center rounded-full bg-danger px-1.5 text-xs font-semibold text-white">{openAlerts}</span>
      ) : null}
    </Link>
  );

  return (
    <ToastProvider>
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 px-4 py-6 md:flex">
          <Link href="/app" className="mb-6 flex items-center gap-2.5 px-3">
            <LogoMark />
            <span className="display text-xl">Haalo</span>
          </Link>
          {parents.length > 1 ? (
            <div className="mb-3 flex flex-wrap gap-1.5 px-1" role="group" aria-label="Choose parent">
              {parents.map((p) => (
                <Link
                  key={p.id}
                  href={`${path}?p=${p.id}`}
                  aria-current={p.id === selected ? "true" : undefined}
                  className={cn("rounded-full border px-3 py-1 text-sm", p.id === selected ? "border-text bg-text text-bg" : "border-border bg-surface")}
                >
                  {p.honorific || p.name}
                </Link>
              ))}
            </div>
          ) : null}
          <nav aria-label="App" className="flex flex-col gap-1">
            {[...nav, ...extra].map((n) => (
              <Item key={n.href} {...n} />
            ))}
          </nav>
          <div className="mt-auto space-y-2 px-3 text-sm text-muted">
            {isAdmin ? (
              <Link href="/admin" className="block hover:text-text">
                Admin
              </Link>
            ) : null}
            <p className="truncate">{viewerName}</p>
            {demo ? <p className="rounded-row bg-warn-bg px-3 py-2 text-warn">Demo data. Connect Supabase in .env to use real data.</p> : null}
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-10">
          {demo ? <p className="mb-4 rounded-row bg-warn-bg px-3 py-2 text-sm text-warn md:hidden">Demo data</p> : null}
          {children}
        </main>

        <nav
          aria-label="App"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-bg/90 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-md md:hidden"
        >
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={withP(href)}
              aria-current={active(href) ? "page" : undefined}
              className={cn("relative flex flex-col items-center gap-0.5 rounded-row py-1.5 text-xs font-medium", active(href) ? "text-text" : "text-muted")}
            >
              <Icon className="size-6" />
              {label}
              {href === "/app/alerts" && openAlerts > 0 ? <span className="absolute right-[22%] top-0.5 size-2.5 rounded-full bg-danger" /> : null}
            </Link>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}
