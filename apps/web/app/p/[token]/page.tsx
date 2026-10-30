import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { ProofUploader } from "@/components/app/care/proof-uploader";
import { LogoMark } from "@/components/landing/nav";

export const metadata: Metadata = { title: "Show Sneha", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The parent's own page: no sign-in, no app. One big button to take a photo of a medicine or a blood-pressure reading. */
export default async function ParentPhotoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{24}$/.test(token)) notFound();
  const db = adminClient();
  const { data: parent } = db ? await db.from("parents").select("honorific, name").eq("proof_token", token).maybeSingle() : { data: null };
  if (!parent) notFound();
  const who = (parent.honorific as string) || (parent.name as string);
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-8 px-5 py-10 text-center">
      <LogoMark className="size-12" />
      <div>
        <h1 className="display text-[34px]">Namaste, {who}</h1>
        <p className="mt-3 text-[19px] text-muted">Show Sneha your medicine, or the number on your blood pressure machine. Sneha will tell the family.</p>
      </div>
      <ProofUploader token={token} />
      <p className="text-sm text-muted">Only the photo you take is sent, and only to your family.</p>
    </main>
  );
}
