import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLanguage } from "@haalo/shared";
import { PhoneMock } from "@/components/phone/phone-mock";
import { demoEnabled } from "@/lib/demo-flag";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Her phone", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * "Her phone": what the parent sees. An ordinary incoming call, no app. Demo workspace parents only (made-up people), so it can be opened on
 * any laptop or phone to talk to Sneha as Aai, Appa or Dadi ji. Real parents are called on their real phones.
 */
export default async function PhonePage({ params, searchParams }: { params: Promise<{ parent: string }>; searchParams: Promise<{ mode?: string; ring?: string }> }) {
  const { parent } = await params;
  const q = await searchParams;
  if (!demoEnabled || !/^[0-9a-f-]{36}$/.test(parent)) notFound();
  const db = adminClient();
  const { data } = db ? await db.from("parents").select("id, name, honorific, language, child_name, is_demo").eq("id", parent).maybeSingle() : { data: null };
  if (!data || !data.is_demo) notFound();
  const lang = getLanguage(data.language as string);
  return (
    <PhoneMock
      parentId={data.id as string}
      honorific={(data.honorific as string) || (data.name as string)}
      language={data.language as string}
      languageName={lang.name}
      child={(data.child_name as string) || "your family"}
      initialMode={q.mode === "reminder" || q.mode === "inbound" ? q.mode : "checkin"}
      autoRing={q.ring === "1"}
    />
  );
}
