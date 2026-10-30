import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { adminClient } from "./supabase/admin";
import { clerkConfigured } from "./supabase/config";
import { DEMO_USER_ID, isDemoSession } from "./demo";

export interface Viewer {
  /** Clerk user id, e.g. "user_2abc...". Also the id used in Supabase rows and RLS (auth.jwt() ->> 'sub'). */
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  demo: boolean;
}

const DEMO: Viewer = { id: "demo-user", email: "riya@example.com", name: "Riya", isAdmin: true, demo: true };
/** The demo workspace visitor: Riya, owner of the sandbox family. Never an admin. */
const WORKSPACE: Viewer = { id: DEMO_USER_ID, email: "riya@demo.haalo", name: "Rohan", isAdmin: false, demo: true };

/** Current user, or null. With no Clerk keys in local dev, returns a demo viewer so the UI is reviewable. */
export async function getViewer(): Promise<Viewer | null> {
  if (await isDemoSession()) return WORKSPACE;
  if (!clerkConfigured) return process.env.NODE_ENV === "production" ? null : DEMO;
  const { userId } = await auth();
  if (!userId) return null;
  const u = await currentUser();
  const email = u?.primaryEmailAddress?.emailAddress ?? "";
  return {
    id: userId,
    email,
    name: u?.firstName || u?.fullName || email.split("@")[0] || "",
    // Set in the Clerk dashboard on the user: Public metadata {"is_admin": true}
    isAdmin: (u?.publicMetadata as { is_admin?: boolean } | undefined)?.is_admin === true,
    demo: false,
  };
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isAdmin) redirect("/app");
  return v;
}

/** First sign-in: make sure a profiles row exists (Supabase no longer creates it via an auth trigger). */
export async function ensureProfile(v: Viewer): Promise<void> {
  if (v.demo) return;
  const db = adminClient();
  if (!db) return;
  await db.from("profiles").upsert({ id: v.id, full_name: v.name }, { onConflict: "id", ignoreDuplicates: true });
}
