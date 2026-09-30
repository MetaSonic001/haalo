const tz = "Asia/Kolkata";

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(iso)).replace(/\s/g, " ") : "";

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  const day = new Date(d.toLocaleString("en-US", { timeZone: tz })).getDate() === new Date(Date.now()).getDate();
  if (day && days < 1) return "Today";
  if (days < 2 && !day) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(d);
}

export const fmtDuration = (s: number | null | undefined) => (s ? `${Math.max(1, Math.round(s / 60))} min` : "");

/** "09:00:00" -> "9:00 am" */
export function fmtClock(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const hh = h! % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${h! < 12 ? "am" : "pm"}`;
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
