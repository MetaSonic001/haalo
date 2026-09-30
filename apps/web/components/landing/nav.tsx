import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill="var(--color-ink)" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#F3A712" strokeOpacity=".35" strokeWidth="2" />
      <circle cx="32" cy="32" r="12.5" fill="#F3A712" />
    </svg>
  );
}

const links = [
  { href: "#how", label: "How it works" },
  { href: "#languages", label: "Languages" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold" aria-label="Haalo home">
          <LogoMark />
          <span className="display text-xl">Haalo</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-text">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <a href="#waitlist">Join the waitlist</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
