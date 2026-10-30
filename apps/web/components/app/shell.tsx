"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, RotateCcw } from "lucide-react";
import { LogoMark } from "@/components/landing/nav";
import { ToastProvider, useToast } from "./toast";
import { navItems, type NavItem } from "./nav-items";
import { resetDemoWorkspace } from "@/app/app/care-actions";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  parents: Array<{ id: string; name: string; honorific: string }>;
  openAlerts: number;
  viewerName: string;
  demo: boolean;
  /** The sandbox family at /demo (real database rows, made-up people). */
  workspace: boolean;
  isAdmin: boolean;
  showLive: boolean;
}

function DemoBar() {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-row bg-ink px-4 py-2.5 text-sm text-white">
      <span className="font-medium">Demo workspace</span>
      <span className="text-white/70">Made-up family, real working features. Nobody real is ever called.</span>
      <span className="ml-auto flex items-center gap-3">
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            setConfirm(false);
            start(async () => {
              const r = await resetDemoWorkspace();
              toast(r.ok ? "Demo data reset to a fresh month." : r.error.message, r.ok ? "good" : "danger");
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-medium hover:bg-white/20 disabled:opacity-60"
        >
          <RotateCcw className={cn("size-3.5", pending && "animate-spin")} /> {pending ? "Resetting..." : confirm ? "Tap again to reset" : "Reset data"}
        </button>
        <a href="/demo/exit" className="font-medium underline-offset-4 hover:underline">
          Exit
        </a>
      </span>
    </div>
  );
}

export function AppShell({ children, parents, openAlerts, viewerName, demo, workspace, isAdmin, showLive }: Props) {
  const path = usePathname();
  const sp = useSearchParams();
  const selected = sp.get("p") ?? parents[0]?.id;
  const withP = (href: string) => (selected && parents.length > 1 ? `${href}?p=${selected}` : href);
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  const items = navItems.filter((n) => !n.demoOnly || showLive);
  const bottom = items.filter((n) => n.primary);
  const moreActive = !bottom.some((n) => active(n.href)) && path !== "/app";

  const Item = ({ href, label, icon: Icon }: NavItem) => (
    <Link
      href={withP(href)}
      aria-current={active(href) ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-row px-3 py-2 text-[15px] font-medium transition-colors duration-150",
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
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 overflow-y-auto px-4 py-6 md:flex">
          <Link href="/app" className="mb-5 flex items-center gap-2.5 px-3">
            <LogoMark />
            <span className="display text-xl">Heartline</span>
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
          <nav aria-label="App" className="flex flex-col gap-0.5">
            {items.map((n) => (
              <Item key={n.href} {...n} />
            ))}
          </nav>
          <div className="mt-auto space-y-2 px-3 pt-4 text-sm text-muted">
            {isAdmin ? (
              <Link href="/admin" className="block hover:text-text">
                Admin
              </Link>
            ) : null}
            <p className="truncate">{viewerName}</p>
            {demo && !workspace ? <p className="rounded-row bg-warn-bg px-3 py-2 text-warn">Sample data. Connect Supabase in .env to use real data.</p> : null}
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8">
          {workspace ? (
            <div className="mb-6">
              <DemoBar />
            </div>
          ) : demo ? (
            <p className="mb-4 rounded-row bg-warn-bg px-3 py-2 text-sm text-warn md:hidden">Sample data</p>
          ) : null}
          {parents.length > 1 ? (
            <div className="mb-5 flex flex-wrap gap-1.5 md:hidden" role="group" aria-label="Choose parent">
              {parents.map((p) => (
                <Link
                  key={p.id}
                  href={`${path}?p=${p.id}`}
                  aria-current={p.id === selected ? "true" : undefined}
                  className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", p.id === selected ? "border-text bg-text text-bg" : "border-border bg-surface")}
                >
                  {p.honorific || p.name}
                </Link>
              ))}
            </div>
          ) : null}
          {children}
        </main>

        <nav
          aria-label="App"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-bg/90 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-md md:hidden"
        >
          {bottom.map(({ href, label, icon: Icon }) => (
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
          <Link href={withP("/app/more")} aria-current={path === "/app/more" ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 rounded-row py-1.5 text-xs font-medium", moreActive || path === "/app/more" ? "text-text" : "text-muted")}>
            <LayoutGrid className="size-6" />
            More
          </Link>
        </nav>
      </div>
    </ToastProvider>
  );
}
