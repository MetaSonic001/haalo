const tz = "Asia/Kolkata";

export const fmtTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(iso)) : "";

export function fmtDay(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return "Today";
  if (same(d, new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(d);
}

export const fmtDuration = (s?: number | null) => (s ? `${Math.max(1, Math.round(s / 60))} min` : "");

/** "09:00:00" -> "9:00 am" */
export function fmtClock(t?: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${(h! % 12) || 12}:${String(m).padStart(2, "0")} ${h! < 12 ? "am" : "pm"}`;
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
