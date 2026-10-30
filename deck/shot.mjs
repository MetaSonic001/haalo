import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://localhost:3000/", { waitUntil: "load" });
await p.waitForTimeout(2500);
await p.screenshot({ path: "deck/img/landing.png" });
await b.close();
