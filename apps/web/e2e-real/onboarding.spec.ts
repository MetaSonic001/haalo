/**
 * Real-stack onboarding test (hits your hosted Supabase project through the running web app). Not part of the default suite.
 *   1. start web (pnpm dev:web) and voice (pnpm dev:voice)
 *   2. cd apps/web && pnpm exec playwright test -c e2e-real/playwright.config.ts
 * Creates a parent named "E2E Test Parent" and leaves it in place so a call can be simulated against it.
 */
import path from "node:path";
import dotenv from "dotenv";
import { expect, test } from "@playwright/test";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
const email = process.env.DEV_LOGIN_EMAIL ?? "";
const password = process.env.DEV_LOGIN_PASSWORD ?? "";

test("sign in, add a Marathi parent through the wizard, see it on the dashboard", async ({ page }) => {
  test.skip(!email || !password, "DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD not set");
  await page.goto("/login");
  await page.getByLabel("Dev email").fill(email);
  await page.getByLabel("Dev password").fill(password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL("**/app**");

  // Fresh account: no parent yet, so onboarding starts.
  await page.goto("/app/parents/new");
  await page.getByPlaceholder("Shobha").fill("E2E Test Parent");
  await page.getByRole("button", { name: "Aai", exact: true }).click();
  await page.getByLabel("Their phone number").fill("+919800000001");
  await page.screenshot({ path: "e2e-real/out/1-who.png" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Which language do they think in?")).toBeVisible();
  await page.screenshot({ path: "e2e-real/out/2-language.png" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("BP tablet").fill("BP tablet");
  await page.getByRole("button", { name: "Add medicine" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Cricket" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Ready to schedule the first call?")).toBeVisible();
  await page.screenshot({ path: "e2e-real/out/3-review.png" });
  await page.getByRole("button", { name: "Schedule first call" }).click();
  await expect(page.getByText(/First call scheduled for 09:00 tomorrow|First call scheduled for 9:00 tomorrow/).first()).toBeVisible({ timeout: 20_000 });

  await page.waitForURL("**/app", { timeout: 15_000 });
  await expect(page.getByText(/Sneha will call Aai at 9:00 tomorrow/)).toBeVisible();
  await page.screenshot({ path: "e2e-real/out/4-dashboard.png" });
});
