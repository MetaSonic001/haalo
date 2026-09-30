import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { MorningSummary } from "@/components/landing/morning-summary";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Languages } from "@/components/landing/languages";
import { Safety } from "@/components/landing/safety";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { faqs } from "@/components/landing/faq-data";
import { Waitlist } from "@/components/landing/waitlist";
import { Footer } from "@/components/landing/footer";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Haalo", description: "A daily call for the people who raised you." },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <MorningSummary />
        <HowItWorks />
        <Languages />
        <Safety />
        <Pricing />
        <Faq />
        <Waitlist />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
