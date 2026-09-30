import { moodTone } from "@haalo/ui-tokens";
import { Chip } from "@/components/ui/chip";

const toneMap = { good: "good", warn: "warn", danger: "danger", muted: "neutral" } as const;

/** Mood is shown as colour AND words, never colour alone. */
export function MoodBadge({ mood }: { mood?: string | null }) {
  const m = moodTone[(mood as keyof typeof moodTone) ?? "unclear"] ?? moodTone.unclear;
  return (
    <Chip tone={toneMap[m.tone]}>
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {m.label}
    </Chip>
  );
}

export function moodSentence(name: string, mood?: string | null) {
  switch (mood) {
    case "good": return `${name} sounded cheerful today`;
    case "okay": return `${name} sounded okay today`;
    case "low": return `${name} sounded a bit low today`;
    default: return `Hard to tell how ${name} was today`;
  }
}
