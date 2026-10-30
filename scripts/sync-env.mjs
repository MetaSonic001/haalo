// Copies the root .env into apps/web/.env.local so Next.js (Turbopack) always sees it. Run automatically before dev/build.
// The root .env stays the single file you edit; apps/web/.env.local is generated and git-ignored.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, ".env");
if (!existsSync(src)) {
  console.warn("sync-env: no root .env found (copy .env.example to .env). Continuing without it.");
  process.exit(0);
}
const keep = /^(NEXT_PUBLIC_|CLERK_|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_PUBLISHABLE_KEY|INTERNAL_SERVICE_KEY|VOICE_SERVICE_URL|PUBLIC_VOICE_BASE_URL|GROQ_API_KEY|GROQ_MODEL_SUMMARY|DEV_LOGIN_|APP_ENV|DEMO_)/;
const lines = readFileSync(src, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && keep.test(l));
writeFileSync(resolve(root, "apps/web/.env.local"), "# GENERATED from the root .env by scripts/sync-env.mjs. Do not edit.\n" + lines.join("\n") + "\n");
console.log(`sync-env: wrote ${lines.length} variables to apps/web/.env.local`);
