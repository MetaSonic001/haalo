import type { Metadata, Viewport } from "next";
import {
  Anek_Bangla,
  Anek_Devanagari,
  Anek_Gujarati,
  Anek_Kannada,
  Anek_Latin,
  Anek_Malayalam,
  Anek_Tamil,
  Anek_Telugu,
} from "next/font/google";
import { cssVariables } from "@haalo/ui-tokens";
import { PRODUCT } from "@haalo/shared";
import { Analytics } from "@/components/analytics";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/supabase/config";
import "./globals.css";

// Anek: one family across every script we support. Variable font with width + weight axes.
// Only Latin + Devanagari (launch languages) are preloaded; the rest load on demand when their script is on screen.
const latin = Anek_Latin({ subsets: ["latin"], axes: ["wdth"], variable: "--font-latin", display: "swap" });
const deva = Anek_Devanagari({ subsets: ["devanagari"], variable: "--font-deva", display: "swap", preload: false });
const guj = Anek_Gujarati({ subsets: ["gujarati"], variable: "--font-guj", display: "swap", preload: false });
const taml = Anek_Tamil({ subsets: ["tamil"], variable: "--font-taml", display: "swap", preload: false });
const telu = Anek_Telugu({ subsets: ["telugu"], variable: "--font-telu", display: "swap", preload: false });
const knda = Anek_Kannada({ subsets: ["kannada"], variable: "--font-knda", display: "swap", preload: false });
const beng = Anek_Bangla({ subsets: ["bengali"], variable: "--font-beng", display: "swap", preload: false });
const mlym = Anek_Malayalam({ subsets: ["malayalam"], variable: "--font-mlym", display: "swap", preload: false });

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: `${PRODUCT.name}: ${PRODUCT.tagline}`, template: `%s | ${PRODUCT.name}` },
  description:
    "Haalo calls your parents every morning in Marathi, Hindi or English, checks on medicines and mood, and sends you a two-line summary.",
  openGraph: { title: PRODUCT.name, description: PRODUCT.tagline, type: "website", siteName: PRODUCT.name },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF2F8" },
    { media: "(prefers-color-scheme: dark)", color: "#1B2246" },
  ],
  colorScheme: "light dark",
};

const themeCss = `
:root { ${cssVariables("light")} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${cssVariables("dark")} } }
:root[data-theme="dark"] { ${cssVariables("dark")} }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fonts = [latin, deva, guj, taml, telu, knda, beng, mlym].map((f) => f.variable).join(" ");
  return (
    <html lang="en" className={fonts} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          Skip to content
        </a>
        {clerkConfigured ? (
          <ClerkProvider appearance={{ variables: { colorPrimary: "#1B2246", borderRadius: "12px", fontFamily: "inherit" } }}>{children}</ClerkProvider>
        ) : (
          children
        )}
        <Analytics />
      </body>
    </html>
  );
}
