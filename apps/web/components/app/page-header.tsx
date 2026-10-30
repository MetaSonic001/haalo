import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, sub, who }: { title: string; sub?: string; who?: string }) {
  return (
    <header className="mb-8">
      <h1 className="display text-[31px] md:text-[39px]">{title}</h1>
      {who ? <p className="mt-1 text-sm font-medium text-muted">{who}</p> : null}
      {sub ? <p className="prose-limit mt-1 text-muted">{sub}</p> : null}
    </header>
  );
}

export function NoParent() {
  return (
    <div className="mx-auto max-w-xl pt-10 text-center">
      <h1 className="display text-[31px]">Add a parent first.</h1>
      <p className="mt-3 text-muted">Everything here is about the person Sneha calls. It takes about three minutes to set up.</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/app/parents/new"><Plus className="size-5" /> Add a parent</Link>
      </Button>
    </div>
  );
}
