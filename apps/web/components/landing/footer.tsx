import Link from "next/link";
import { LogoMark } from "./nav";
import { PRODUCT } from "@haalo/shared";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="size-7" />
          <p>
            <span className="font-semibold text-text">Haalo</span> · {PRODUCT.taglineLocal}
          </p>
        </div>
        <nav aria-label="Legal" className="flex gap-6">
          <Link href="/legal/privacy" className="hover:text-text">
            Privacy (draft)
          </Link>
          <Link href="/legal/terms" className="hover:text-text">
            Terms (draft)
          </Link>
        </nav>
      </div>
    </footer>
  );
}
