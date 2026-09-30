"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resolveFlagAdmin } from "@/app/admin/actions";

export function ResolveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => void (await resolveFlagAdmin(id)))}>
      Mark followed up
    </Button>
  );
}
