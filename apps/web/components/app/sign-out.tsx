"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignOut() {
  return (
    <SignOutButton redirectUrl="/">
      <Button variant="ghost" type="button">
        Sign out
      </Button>
    </SignOutButton>
  );
}
