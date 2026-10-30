import { Activity, Bell, CalendarDays, Heart, LineChart, MessageCircleHeart, Mic, Phone, Pill, Settings, ShieldCheck, Sun, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar. */
  primary?: boolean;
  demoOnly?: boolean;
}

/** Everything in the family app, in the order it appears in the sidebar and on the "More" page. */
export const navItems: NavItem[] = [
  { href: "/app", label: "Today", hint: "How the day is going", icon: Sun, primary: true },
  { href: "/app/medicines", label: "Medicines", hint: "Doses, reminders and refills", icon: Pill, primary: true },
  { href: "/app/health", label: "Health", hint: "Readings and photo proof", icon: Activity, primary: true },
  { href: "/app/alerts", label: "Alerts", hint: "Anything that needs you", icon: Bell, primary: true },
  { href: "/app/safety", label: "Safety", hint: "The alert ladder and contacts", icon: ShieldCheck },
  { href: "/app/calls", label: "Calls", hint: "Every conversation, with transcripts", icon: Phone },
  { href: "/app/messages", label: "Messages", hint: "Say something through Sneha", icon: MessageCircleHeart },
  { href: "/app/calendar", label: "Calendar", hint: "Appointments, festivals, birthdays", icon: CalendarDays },
  { href: "/app/insights", label: "Trends", hint: "What changed over the weeks", icon: LineChart },
  { href: "/app/family", label: "Family", hint: "Who is in the circle", icon: Users },
  { href: "/app/memory", label: "Memory Lane", hint: "Stories worth keeping", icon: Heart },
  { href: "/app/live", label: "Live demo", hint: "Talk to Sneha as the parent", icon: Mic, demoOnly: true },
  { href: "/app/settings", label: "Settings", hint: "Schedule, privacy, alerts", icon: Settings },
];

export const primaryNav = navItems.filter((n) => n.primary);
export const moreLinks = navItems.filter((n) => !n.primary || n.href === "/app/alerts");
