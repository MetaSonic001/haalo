import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  workers: 1,
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 900 } },
  reporter: "list",
});
