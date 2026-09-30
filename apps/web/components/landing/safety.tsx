import { BadgeCheck, Ban, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const tiles = [
  {
    icon: BadgeCheck,
    title: "Honest about being an AI",
    body: "The very first call says Haalo is an AI assistant set up by you, and asks for permission. If she says no, calls stop and you are told.",
    wide: true,
  },
  {
    icon: Ban,
    title: "Never medical advice",
    body: "Haalo asks, listens and logs. It never diagnoses or touches a dose. For anything worrying it tells her to reach family or call 112, and tells you.",
  },
  {
    icon: ShieldAlert,
    title: "Scam and emergency alerts",
    body: "A fall, chest pain, confusion, distress, or someone asking her for an OTP: you hear at once, with the exact words she used.",
  },
  {
    icon: Trash2,
    title: "Private, and always in her control",
    body: "Recordings are off unless she opts in, and transcripts are visible only to your family circle. \"Don't call tomorrow\" and \"call me later\" are honoured. Export or delete everything in one tap.",
    wide: true,
  },
];

export function Safety() {
  return (
    <section id="safety" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <h2 className="display max-w-2xl text-[31px] sm:text-[39px]">Calm for you, and respect for her.</h2>
      <div className="mt-12 grid gap-4 md:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.title} className={cn("rounded-card bg-surface p-7", t.wide ? "md:col-span-4" : "md:col-span-2")}>
            <span className="grid size-11 place-items-center rounded-2xl bg-surface-alt">
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
