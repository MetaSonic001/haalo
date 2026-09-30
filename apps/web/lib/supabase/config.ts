/** Supabase's current docs call the public key "publishable"; legacy projects still use "anon". Accept both. */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

/** Auth is Clerk. Without Clerk keys the app runs in local demo mode (never in production). */
export const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
/** Data access needs both: Clerk to know the user, Supabase to hold the data. Otherwise demo data is shown. */
export const liveMode = clerkConfigured && supabaseConfigured;
