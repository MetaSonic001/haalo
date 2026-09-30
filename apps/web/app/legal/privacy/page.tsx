import Link from "next/link";

export const metadata = { title: "Privacy policy (draft)" };

export default function Privacy() {
  return (
    <main id="main" className="prose-limit mx-auto px-4 py-16">
      <p className="mb-6 rounded-row bg-warn-bg px-4 py-3 font-medium text-warn">
        DRAFT for legal review. Not yet reviewed by a lawyer. Do not treat as final. Written with India&apos;s Digital Personal Data Protection Act,
        2023 (DPDP) in mind.
      </p>
      <h1 className="display text-[39px]">Privacy policy</h1>
      <p className="mt-2 text-muted">Draft version 0.1</p>

      <Section title="Who we are">
        Haalo is a service that phones older people on behalf of their family, has a short friendly conversation, and shares a summary with the
        family. [Company legal name, registered address and grievance officer contact to be added.]
      </Section>
      <Section title="What we collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>Family member account details: name, email, language and time zone preferences.</li>
          <li>Parent details you enter: name, how they are addressed, phone number, language, medicines, interests, family names.</li>
          <li>Call data: text transcripts of conversations, summaries, mood and health check-in notes, safety flags, and technical metadata (time, duration, latency, cost).</li>
          <li>Audio recordings only if the parent has explicitly opted in. By default we keep text transcripts, not audio.</li>
        </ul>
      </Section>
      <Section title="Consent">
        The family member consents in the app terms. The parent is told, on the very first call, that Haalo is an AI assistant set up by their family
        member, and is asked for permission. If they decline, calls stop and the family member is notified. Consent status is recorded with a
        timestamp.
      </Section>
      <Section title="How we use it">
        To make and summarise calls, to alert the family about possible emergencies or scams, to keep the service safe, and to improve language
        quality. Improving speech models with recorded audio happens only with separate, explicit opt-in consent.
      </Section>
      <Section title="Who can see it">
        Only members of the family circle. Transcripts are not visible to other families. Haalo staff may review a call for quality or safety, and
        access is logged. We use service providers to run the product (hosting, database, speech and language processing, telephony); a list is
        available on request. [Provider list and data-transfer details to be completed.]
      </Section>
      <Section title="Retention and deletion">
        Recordings, if enabled, are deleted automatically after a configurable number of days. Family members can export or delete everything held
        about a parent at any time from Settings. Deleting removes calls, transcripts, summaries, memories and flags.
      </Section>
      <Section title="Your rights">
        Access, correction, erasure, withdrawal of consent, and grievance redressal under the DPDP Act. Contact: [email to be added].
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
      <div className="mt-2 text-muted">{children}</div>
    </section>
  );
}
