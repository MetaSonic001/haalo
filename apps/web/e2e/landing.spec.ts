import { expect, test } from "@playwright/test";

test("landing: headline, languages, demo button reflects language", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A daily call for the people who raised you.");
  const demo = page.getByRole("button", { name: /Hear Haalo in Marathi/ });
  await expect(demo).toBeVisible();
  await page.getByRole("radio", { name: "हिन्दी" }).click();
  await expect(page.getByRole("button", { name: /Hear Haalo in Hindi/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "The Haalo orb" }).first()).toBeVisible();
});

test("landing: no horizontal scroll and readable at phone width", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("landing: FAQ opens and sections exist", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Three steps/ })).toBeVisible();
  await page.getByRole("button", { name: /Does my mother need a smartphone/ }).click();
  await expect(page.getByText(/rings her ordinary phone/)).toBeVisible();
});

test("reduced motion: the orb stops animating", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/");
  const anim = await page.locator(".orb-core").evaluate((el) => getComputedStyle(el).animationName);
  expect(["none", ""].includes(anim) || (await page.locator(".orb-core").evaluate((el) => getComputedStyle(el).animationDuration)) === "1e-05s").toBeTruthy();
  await ctx.close();
});

test("legal drafts are clearly marked as drafts", async ({ page }) => {
  for (const p of ["/legal/privacy", "/legal/terms"]) {
    await page.goto(p);
    await expect(page.getByText(/DRAFT for legal review/)).toBeVisible();
  }
});
