import { Check } from "lucide-react";
import { PRICING_PLACEHOLDER } from "@haalo/shared";
import { Button } from "@/components/ui/button";

const included = [
  "A daily call in her language",
  "Two-line summary after every call",
  "Instant alerts for emergencies and scams",
  "Whole family circle, one shared view",
];

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-surface py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="display text-[31px] sm:text-[39px]">Free while we learn with the first families.</h2>
          <p className="prose-limit mt-4 text-lg text-muted">{PRICING_PLACEHOLDER.blurb}</p>
        </div>
        <div className="rounded-card bg-ink p-8 text-morning">
          <p className="text-lg text-morning/80">{PRICING_PLACEHOLDER.name}</p>
          <p className="display mt-1 text-[49px]">₹0</p>
          <ul className="mt-6 space-y-3">
            {included.map((i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="grid size-5 place-items-center rounded-full bg-marigold text-ink">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {i}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="mt-8 w-full">
            <a href="#waitlist">Join the waitlist</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
