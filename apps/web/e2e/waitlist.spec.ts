import { expect, test } from "@playwright/test";

test("waitlist: joins with email, city and language", async ({ page }) => {
  await page.goto("/#waitlist");
  await page.getByLabel("Your email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Your city").fill("Pune");
  await page.getByLabel("Parent's language").selectOption("mr");
  await page.getByRole("button", { name: "Join the waitlist" }).last().click();
  await expect(page.getByText("You're on the list.")).toBeVisible();
});

test("waitlist: a bad email shows a fix, not a crash", async ({ page }) => {
  await page.goto("/#waitlist");
  await page.getByLabel("Your email").fill("not-an-email");
  await page.getByRole("button", { name: "Join the waitlist" }).last().click();
  // native validation blocks submit; the field stays and the success state never appears
  await expect(page.getByText("You're on the list.")).toHaveCount(0);
});
