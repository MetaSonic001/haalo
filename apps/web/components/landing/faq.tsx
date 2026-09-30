"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { faqs } from "./faq-data";


export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <h2 className="display text-[31px] sm:text-[39px]">Questions families ask first</h2>
      <Accordion.Root type="single" collapsible className="mt-8 divide-y divide-border rounded-card bg-surface">
        {faqs.map(([q, a]) => (
          <Accordion.Item key={q} value={q}>
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-lg font-medium">
                {q}
                <Plus className="size-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-45" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden px-6 text-muted">
              <p className="prose-limit pb-5">{a}</p>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}
