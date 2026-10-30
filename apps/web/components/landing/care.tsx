import { Activity, CalendarHeart, LineChart, MessageCircleHeart, Pill, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  {
    icon: Pill,
    title: "Medicines, with a closed loop",
    body: "Sneha calls at each dose time, asks her to confirm, tries once more, and tells you if it still isn't confirmed. Important medicines escalate. You see \"Appa took his 8:30 tablet\" the moment it happens, and a refill warning five days before it runs out.",
    wide: true,
  },
  {
    icon: ShieldAlert,
    title: "An alert ladder, not one message",
    body: "A fall, chest pain, or a day of unanswered calls alerts the whole family, then phones your emergency contacts one by one until someone says they are on it.",
  },
  {
    icon: Activity,
    title: "Readings, spoken or photographed",
    body: "\"My BP is 150 over 95\" on a call, or a photo of the monitor or the medicine strip from her smartphone. Sneha reads it, charts it, and flags what is outside the range your family agreed.",
  },
  {
    icon: MessageCircleHeart,
    title: "Say it through Sneha",
    body: "A grandchild's good news, or a question about the house. Sneha says it in her language on the next call and brings you back her answer.",
  },
  {
    icon: LineChart,
    title: "Trends you would miss in one call",
    body: "Quieter replies, lower mood, poor sleep, skipped meals, a creeping blood pressure: noticed over weeks, and phrased as \"worth a call\", never as a diagnosis.",
    wide: true,
  },
  {
    icon: CalendarHeart,
    title: "Appointments and festivals",
    body: "Reminds her of tomorrow's check-up. Wishes Diwali, Eid or Christmas only if that is her tradition, and her birthday every year.",
  },
];

export function Care() {
  return (
    <section id="care" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <h2 className="display max-w-3xl text-[31px] sm:text-[39px]">More than a daily chat. A whole care loop, on a phone call.</h2>
      <p className="prose-limit mt-4 text-lg text-muted">
        Everything happens by voice, on her ordinary phone. You get the family dashboard, and she gets nothing new to learn.
      </p>
      <div className="mt-12 grid gap-4 md:grid-cols-6">
        {items.map((t) => (
          <div key={t.title} className={cn("rounded-card bg-surface p-7", t.wide ? "md:col-span-4" : "md:col-span-2")}>
            <span className="grid size-11 place-items-center rounded-2xl bg-accent text-on-accent">
              <t.icon className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-semibold">{t.title}</h3>
            <p className="prose-limit mt-2 text-muted">{t.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
