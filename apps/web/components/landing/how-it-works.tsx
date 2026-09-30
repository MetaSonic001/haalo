import { CalendarClock, HeartPulse, PhoneCall } from "lucide-react";

const steps = [
  {
    icon: CalendarClock,
    title: "Tell us about Aai",
    body: "Her name, how you address her, her language, when she is usually free, her medicines and the things she loves talking about. Five short steps, about three minutes.",
  },
  {
    icon: PhoneCall,
    title: "Haalo calls every day",
    body: "A warm, unhurried call on her ordinary phone. Nothing to install. The first call introduces Haalo as an AI assistant and asks her permission.",
  },
  {
    icon: HeartPulse,
    title: "You get the summary and alerts",
    body: "A two-line note after each call. If she mentions a fall, chest pain, confusion or a suspicious caller, you hear immediately.",
  },
];

/** A numbered sequence is right here: these really are steps, in order. */
export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <h2 className="display max-w-2xl text-[31px] sm:text-[39px]">Three steps, then it just happens every morning.</h2>
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative rounded-card bg-surface p-7">
            <span className="display absolute right-6 top-4 select-none text-[64px] text-border" aria-hidden>
              {i + 1}
            </span>
            <span className="grid size-12 place-items-center rounded-2xl bg-accent text-on-accent">
              <s.icon className="size-6" />
            </span>
            <h3 className="mt-6 text-xl font-semibold">
              <span className="sr-only">Step {i + 1}: </span>
              {s.title}
            </h3>
            <p className="mt-2 text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
