// Screenshots every mobile screen of the demo build at phone size, for checking layout. node tools/demo-video/shot-mobile.mjs <outdir>
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "demo/mobile-shots";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", isMobile: false });
const p = await c.newPage();
await p.goto("http://localhost:8082/", { waitUntil: "load" });
await p.waitForTimeout(3500);
const shot = async (name) => {
  await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(out, `${name}.png`) });
  console.log("shot", name);
};
await shot("today");
for (const route of ["medicines", "health", "alerts", "more", "safety", "messages", "trends", "calendar"]) {
  await p.goto(`http://localhost:8082/${route}`, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await shot(route);
}
await b.close();
