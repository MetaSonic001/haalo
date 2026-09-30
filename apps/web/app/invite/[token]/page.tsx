import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { acceptInvite } from "@/app/app/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Join a family", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const res = await acceptInvite(token);
  if (res.ok) redirect("/app");
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="display text-[31px]">This invite didn&apos;t work.</h1>
      <p className="mt-3 text-muted">{res.error.message}</p>
      <Button asChild className="mt-8">
        <Link href="/app">Go to my dashboard</Link>
      </Button>
    </main>
  );
}
