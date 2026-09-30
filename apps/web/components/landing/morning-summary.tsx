"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, Phone } from "lucide-react";
import { LogoMark } from "./nav";

const spring = { type: "spring", stiffness: 380, damping: 30 } as const;

/**
 * "The morning summary": exactly what a child receives at 9:07am. This is the product in one glance,
 * so it is the one section that animates on scroll (once): call -> beam -> summary card -> chips.
 */
export function MorningSummary() {
  const reduce = useReducedMotion();
  const pop = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 14, scale: 0.97 }, whileInView: { opacity: 1, y: 0, scale: 1 }, viewport: { once: true, margin: "-80px" }, transition: { ...spring, delay } };

  return (
    <section className="relative overflow-hidden bg-ink text-morning">
      <div aria-hidden className="dots absolute inset-0 opacity-50 [mask-image:radial-gradient(60%_60%_at_70%_40%,black,transparent)]" />
      <div
        aria-hidden
        className="absolute -right-32 top-0 size-[520px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(243,167,18,.5), transparent 65%)" }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-[0.9fr_1.1fr] md:py-28">
        <div>
          <h2 className="display text-[31px] sm:text-[39px]">The whole product, in one glance.</h2>
          <p className="prose-limit mt-5 text-lg text-morning/80">
            At 9:07am, after Aai&apos;s call, this lands on your phone. Not a report to read. Just how she is, in the words you&apos;d
            use with your sister.
          </p>
          <ul className="mt-8 space-y-3 text-morning/85">
            {["Mood, medicines, meals and sleep, checked gently", "Anything worrying reaches you the moment it is said", "You can read the full conversation whenever you like"].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-marigold text-ink">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto w-full max-w-md">
          <motion.div {...pop(0)} className="mx-auto flex w-fit items-center gap-2 rounded-full bg-morning/10 px-4 py-2 text-sm backdrop-blur">
            <Phone className="size-4 text-marigold" /> 9:00 am · Haalo called Aai · 6 min
          </motion.div>

          <svg viewBox="0 0 8 72" className="mx-auto block h-[72px] w-2" aria-hidden>
            <defs>
              <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#F3A712" stopOpacity="0" />
                <stop offset="0.5" stopColor="#F3A712" />
                <stop offset="1" stopColor="#F3A712" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M4 0 V72" stroke="rgba(238,242,248,.16)" strokeWidth="2" fill="none" />
            <path className="beam-path" d="M4 0 V72" stroke="url(#beam)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>

          <motion.article
            {...pop(0.15)}
            className="rounded-card border border-morning/15 bg-morning/[0.08] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,.6)] backdrop-blur-xl"
            aria-label="Example summary notification"
          >
            <header className="flex items-center gap-3">
              <LogoMark className="size-9" />
              <div className="flex-1 leading-tight">
                <p className="font-semibold">Aai&apos;s call today</p>
                <p className="text-sm text-morning/85">Haalo · 9:07 am</p>
              </div>
            </header>
            <p className="mt-4 text-[17px] leading-relaxed">
              Aai sounded cheerful and took her BP tablet. She went to the temple with Shobha kaku. Her knee was a little sore in the
              evening, so Haalo will ask again tomorrow.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <motion.span {...pop(0.45)} className="inline-flex items-center gap-1.5 rounded-full bg-[#DDF0E4] px-3 py-1 text-sm font-medium text-[#2B6B44]">
                <span className="size-2 rounded-full bg-[#2B6B44]" /> Cheerful
              </motion.span>
              <motion.span {...pop(0.6)} className="inline-flex items-center gap-1.5 rounded-full bg-morning px-3 py-1 text-sm font-medium text-ink">
                <Check className="size-4 text-[#2B6B44]" strokeWidth={3} /> BP tablet taken
              </motion.span>
              <motion.span {...pop(0.75)} className="inline-flex items-center gap-1.5 rounded-full bg-[#FCEFCB] px-3 py-1 text-sm font-medium text-[#8A5A00]">
                Knee a little sore
              </motion.span>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}
