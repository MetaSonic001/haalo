import { expect, test } from "@playwright/test";

test("dashboard (demo data): today card, medicine ticks, alert banner", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Aai sounded cheerful today/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Medicines" }).getByText("BP tablet")).toBeVisible();
  await expect(page.getByText(/1 alert needs your attention/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Call Aai now/ })).toBeVisible();
});

test("dashboard: acknowledge an alert collapses it", async ({ page }) => {
  await page.goto("/app/alerts");
  await expect(page.getByText("recurring complaint")).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();
});

test("dashboard: call detail shows a collapsed bilingual transcript", async ({ page }) => {
  await page.goto("/app/calls/c1");
  const toggle = page.getByRole("button", { name: /Full conversation/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByText("Original")).toBeVisible();
  await expect(page.getByRole("button", { name: "English" })).toBeVisible();
});

test("add parent: five steps, validation, review, schedule", async ({ page }) => {
  await page.goto("/app/parents/new");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter their name")).toBeVisible();
  await page.getByPlaceholder("Shobha").fill("Shobha");
  await page.getByRole("button", { name: "Aai", exact: true }).click();
  await page.getByLabel("Their phone number").fill("+919876543210");
  await page.getByRole("button", { name: "Continue" }).click(); // -> language
  await page.getByRole("button", { name: "Continue" }).click(); // -> call time
  await page.getByRole("button", { name: "Continue" }).click(); // -> medicines
  await page.getByPlaceholder("BP tablet").fill("BP tablet");
  await page.getByRole("button", { name: "Add medicine" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // -> loves
  await page.getByRole("button", { name: "Cricket" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // -> review
  await expect(page.getByText(/asks Aai for permission|asks .* for permission/)).toBeVisible();
  await page.getByRole("button", { name: "Schedule first call" }).click();
  await expect(page.getByText(/First call scheduled for 9:00 tomorrow/).first()).toBeVisible();
});

test("admin (demo): flags queue, cost meter and waitlist export exist", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Open flags/ })).toBeVisible();
  await expect(page.getByText("Cost per completed")).toBeVisible();
  await page.goto("/admin/waitlist");
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
});
