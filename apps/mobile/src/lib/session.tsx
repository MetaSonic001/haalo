import { ClerkProvider, useAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { createContext, useContext, useEffect, useMemo } from "react";
import { config } from "./config";
import { setTokenGetter } from "./supabase";

interface SessionCtx {
  ready: boolean;
  /** Truthy when signed in (or in demo mode). */
  session: { userId: string } | null;
  userId: string;
  name: string;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

const DEMO: SessionCtx = { ready: true, session: { userId: "demo-user" }, userId: "demo-user", name: "Rohan", signOut: async () => {} };

function ClerkSession({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const { user } = useUser();

  // Supabase reads the Clerk session token through this getter (see lib/supabase.ts).
  useEffect(() => {
    setTokenGetter(isSignedIn ? () => getToken() : null);
    return () => setTokenGetter(null);
  }, [isSignedIn, getToken]);

  const value = useMemo<SessionCtx>(
    () => ({
      ready: isLoaded,
      session: isSignedIn && userId ? { userId } : null,
      userId: userId ?? "",
      name: user?.firstName || user?.fullName || user?.primaryEmailAddress?.emailAddress?.split("@")[0] || "",
      signOut: async () => {
        await signOut();
      },
    }),
    [isLoaded, isSignedIn, userId, user, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Clerk owns sign-in. Without keys (demo mode) the app is explorable on sample data with no auth at all. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  if (config.demo || config.workspace) return <Ctx.Provider value={DEMO}>{children}</Ctx.Provider>;
  return (
    <ClerkProvider publishableKey={config.clerkKey} tokenCache={tokenCache}>
      <ClerkSession>{children}</ClerkSession>
    </ClerkProvider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
