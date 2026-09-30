import { cn } from "@/lib/utils";

type Tone = "neutral" | "good" | "warn" | "danger" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-alt text-text",
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  accent: "bg-accent text-on-accent",
};

/** Pill chip. Status chips always carry a word, never colour alone. */
export function Chip({
  tone = "neutral",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", tones[tone], className)}
      {...rest}
    >
      {children}
    </span>
  );
}
