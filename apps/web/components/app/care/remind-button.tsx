"use client";

import { useTransition } from "react";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/app/toast";
import { remindNow } from "@/app/app/care-actions";

/** Real families: ring the parent now about unconfirmed doses. Demo workspace: make a dose due, then try the call from the Live demo page. */
export function RemindButton({ parentId, name }: { parentId: string; name: string; demo?: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await remindNow(parentId);
          if (r.ok) toast(r.data.mode === "dose_due" ? `${r.data.medicine} is due. ${name}'s phone is ringing.` : `Sneha is calling ${name} about the dose.`);
          else toast(r.error.message, "danger");
        })
      }
    >
      <PhoneCall className="size-4" /> Remind {name} now
    </Button>
  );
}
