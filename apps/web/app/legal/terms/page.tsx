import Link from "next/link";

export const metadata = { title: "Terms of service (draft)" };

export default function Terms() {
  return (
    <main id="main" className="prose-limit mx-auto px-4 py-16">
      <p className="mb-6 rounded-row bg-warn-bg px-4 py-3 font-medium text-warn">
        DRAFT for legal review. Not yet reviewed by a lawyer. Do not treat as final.
      </p>
      <h1 className="display text-[39px]">Terms of service</h1>
      <p className="mt-2 text-muted">Draft version 0.1</p>

      <Section title="The service">
        Haalo places automated phone calls, powered by artificial intelligence, to a person you nominate, in their language, to chat and check on their
        wellbeing, and sends you a summary. During the free pilot the service is provided as is, without charge.
      </Section>
      <Section title="What Haalo is not">
        Haalo is not a medical device, emergency service, or a substitute for care. It does not give medical, legal or financial advice. It may fail to
        hear, understand or act on something serious. In an emergency, call 112 or your local emergency number. Do not rely on Haalo alone to keep
        someone safe.
      </Section>
      <Section title="Your responsibilities">
        You confirm that you are authorised to provide the parent&apos;s phone number, that the parent knows about the calls, and that you will not use
        Haalo to harass, deceive or pressure anyone. The parent may decline at any time, and calls will then stop.
      </Section>
      <Section title="Honesty about AI">
        Haalo always identifies itself as an AI assistant on the first call and will not pretend to be a person or a member of the family.
      </Section>
      <Section title="Data">
        See the privacy policy. You can export or delete data at any time.
      </Section>
      <Section title="Liability and changes">
        [Limitation of liability, governing law, dispute resolution and change-of-terms clauses to be drafted by counsel.]
      </Section>
      <p className="mt-10">
        <Link href="/" className="font-medium underline">
          Back to Haalo
        </Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-muted">{children}</p>
    </section>
  );
}
