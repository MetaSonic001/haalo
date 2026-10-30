"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "connecting" | "listening" | "speaking";

interface OrbProps {
  /** Pixel size; omit to size with className (e.g. w-[min(420px,82vw)]). */
  size?: number;
  state?: OrbState;
  /** 0..1 audio amplitude (from the WebRTC stream). */
  level?: MotionValue<number>;
  className?: string;
  label?: string;
}

const RINGS = [0, 0.32, 0.64];

function Ring({ amp, i, live }: { amp: MotionValue<number>; i: number; live: boolean }) {
  // Each ring reacts a little more than the one inside it, like ripples on water.
  const scale = useTransform(amp, (v) => 1 + v * (0.08 + i * 0.09));
  return (
    <motion.span
      aria-hidden
      className={cn("absolute rounded-full border border-marigold", live ? "orb-ring-live" : "orb-ring")}
      style={{ inset: `${(2 - i) * 6 + 2}%`, ["--d" as string]: `${RINGS[i]}s`, scale }}
    />
  );
}

/**
 * The one signature element: a marigold circle with concentric rings, somewhere between a phone ringing and a diya's glow.
 * Page load: rings expand and fade twice, then the orb breathes. Live: rings follow real audio amplitude.
 */
export function Orb({ size, state = "idle", level, className, label }: OrbProps) {
  const reduce = useReducedMotion();
  const live = state !== "idle";
  const zero = useMotionValue(0);
  const amp = useSpring(level && !reduce ? level : zero, { stiffness: 260, damping: 26 });
  const coreScale = useTransform(amp, (v) => 1 + v * 0.16);

  return (
    <div
      role="img"
      aria-label={label ?? "The Sneha orb"}
      className={cn("relative isolate aspect-square", className)}
      style={size ? { width: size, height: size } : undefined}
    >
      {/* aurora: soft coral + indigo washes behind the marigold */}
      <div
        aria-hidden
        className="orb-aurora pointer-events-none absolute -inset-[32%] -z-10 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(38% 38% at 50% 50%, rgba(243,167,18,.55), transparent 70%), radial-gradient(30% 30% at 72% 30%, rgba(242,107,79,.32), transparent 70%), radial-gradient(34% 34% at 24% 76%, rgba(91,107,214,.30), transparent 70%)",
        }}
      />
      {RINGS.map((_, i) => (
        <Ring key={i} amp={amp} i={i} live={live} />
      ))}
      <motion.div
        aria-hidden
        className={cn("absolute inset-[22%] rounded-full", live ? "" : "orb-core")}
        style={{
          scale: coreScale,
          background: "radial-gradient(circle at 34% 28%, #FFE29A 0%, #F8BE3D 30%, #F3A712 58%, #D98A00 100%)",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,.35) inset, 0 -14px 30px rgba(190,110,0,.35) inset, 0 24px 60px -12px rgba(243,167,18,.6)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[22%] rounded-full opacity-60 mix-blend-soft-light"
        style={{ background: "radial-gradient(circle at 30% 22%, #fff 0%, transparent 42%)" }}
      />
    </div>
  );
}
