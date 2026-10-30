// Records the Heartline product demo: one family, three screens.
//   - Aai (the mother) on an ordinary phone that rings and talks to Sneha in Marathi
//   - Rohan (her son) at his office, on the family website
//   - Rohan on the move, in the Heartline mobile app
//
//   node tools/demo-video/record.mjs                         # every scene
//   ONLY=morning,aftermath node tools/demo-video/record.mjs  # some scenes
//
// Needs, running: the web app (production build, :3000), the voice service (:7860), the mobile web build (node tools/demo-video/serve-mobile.mjs, :8082),
// and `prep.py` run just before (it resets the demo data and synthesises the parents' lines). Output goes to ./demo/ at the repo root.
//
// The parents' voices are synthesised speech played into the page as if it were the microphone, so every call in the video is a real WebRTC call:
// Sneha really listens, understands, replies, and writes to the database. Nothing on screen is mocked.

import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const OUT = path.join(root, "demo");
const BASE = process.env.BASE ?? "http://localhost:3000";
const MOBILE = process.env.MOBILE ?? "http://localhost:8082";
// CAP=1 records the real screen with Cap (cap.so): a visible full-screen browser, and Cap captures the picture and the system audio.
// Otherwise a hidden browser is filmed by Playwright and the call audio is mixed in afterwards (see assemble.mjs).
const CAP = process.env.CAP === "1";
const W = CAP ? 1440 : 1920; // headless: rendered at 1920x1080 and zoomed with CSS so text is large and crisp. Cap: the screen's own size.
const H = CAP ? 900 : 1080;
const ZOOM = Number(process.env.ZOOM ?? (CAP ? 1 : 1.3333));
const CAP_EXE = process.env.CAP_CLI ?? path.join(process.env.LOCALAPPDATA ?? "", "Cap", "cap-cli.exe");
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const state = JSON.parse(fs.readFileSync(path.join(here, "state.json"), "utf8"));
const P = state.parents;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (name) => ONLY.length === 0 || ONLY.includes(name);

fs.mkdirSync(OUT, { recursive: true });
const tmpVideos = path.join(OUT, ".raw");
fs.rmSync(tmpVideos, { recursive: true, force: true });

import { makeInit } from "./init-script.mjs";
const INIT = makeInit(ZOOM, CAP);

// ------------------------------------------------------------------ title / closing cards
const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Anek+Latin:wdth,wght@75..125,100..800&display=swap" rel="stylesheet">`;
const cardCss = `
  *{box-sizing:border-box;margin:0} html,body{height:100%}
  body{font-family:'Anek Latin',system-ui,sans-serif;background:#1b2246;color:#fff;display:grid;place-items:center;overflow:hidden}
  .glow{position:absolute;inset:0;background:radial-gradient(60% 60% at 70% 30%,rgba(243,167,18,.32),transparent 60%),radial-gradient(50% 50% at 15% 85%,rgba(120,140,255,.22),transparent 60%)}
  main{position:relative;max-width:1150px;padding:0 70px;text-align:left}
  .logo{display:flex;align-items:center;gap:18px;margin-bottom:46px}
  .mark{width:64px;height:64px;border-radius:18px;background:#fff1;display:grid;place-items:center;border:1px solid #fff3}
  .dot{width:30px;height:30px;border-radius:50%;background:#f3a712;box-shadow:0 0 0 12px rgba(243,167,18,.18),0 0 0 26px rgba(243,167,18,.08)}
  .name{font-size:34px;font-weight:620;font-stretch:118%;letter-spacing:-.01em}
  h1{font-size:84px;line-height:1.04;font-weight:620;font-stretch:118%;letter-spacing:-.02em;text-wrap:balance}
  h1 em{font-style:normal;color:#f3a712}
  p.sub{margin-top:34px;font-size:30px;line-height:1.4;color:#ffffffb8;max-width:900px}
  .stats{display:grid;gap:30px;margin-top:10px}
  .stat{display:flex;align-items:baseline;gap:28px}
  .stat b{font-size:88px;font-weight:700;font-stretch:118%;color:#f3a712;min-width:360px;letter-spacing:-.02em}
  .stat span{font-size:34px;line-height:1.25;color:#ffffffe0;max-width:620px}
  .small{margin-top:40px;font-size:20px;color:#ffffff80}
  .cta{display:inline-block;margin-top:44px;padding:18px 34px;border-radius:999px;background:#f3a712;color:#1b2246;font-size:28px;font-weight:650}
  .cast{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:44px}
  .cast div{background:#ffffff12;border:1px solid #ffffff22;border-radius:26px;padding:26px 28px}
  .cast b{display:block;font-size:30px;font-weight:620;font-stretch:112%}
  .cast span{display:block;margin-top:8px;font-size:22px;line-height:1.35;color:#ffffffbd}
`;
const cards = {
  title: `<main><div class="logo"><div class="mark"><div class="dot"></div></div><div class="name">Heartline</div></div><h1>A daily call for the people <em>who raised you.</em></h1><p class="sub">An AI voice that phones your parents every day, in their own language, on an ordinary phone. No app for them to learn.</p></main>`,
  problem: `<main><div class="stats">
    <div class="stat"><b>194 million</b><span>Indians will be over 60 by 2031, up from 138 million in 2021.</span></div>
    <div class="stat"><b>About half</b><span>of people on long-term medicines do not take them as prescribed (WHO).</span></div>
    <div class="stat"><b>Zero apps</b><span>Most parents will never install one. Everyone answers a phone call.</span></div>
  </div><p class="small">Sources: MoSPI, Elderly in India 2021 (projections). WHO, Adherence to Long-Term Therapies (2003).</p></main>`,
  cast: `<main><h1>Meet the <em>Kulkarnis.</em></h1><p class="sub">Rohan works in a Mumbai office. His mother Aai lives alone in Pune. Heartline's voice, Sneha, phones her every morning.</p><div class="cast">
    <div><b>Aai</b><span>On an ordinary phone. Speaks Marathi. Never installs apps.</span></div>
    <div><b>Rohan, at work</b><span>Watches the family website between meetings.</span></div>
    <div><b>Rohan, on the move</b><span>Gets alerts in the Heartline mobile app.</span></div></div></main>`,
  closing: `<main><div class="logo"><div class="mark"><div class="dot"></div></div><div class="name">Heartline</div></div><h1>Peace of mind, in <em>her own language.</em></h1><p class="sub">Medicines confirmed. Readings tracked. Falls and silence escalated until a human answers. All on a phone call.</p><span class="cta">Try the live demo</span></main>`,
};
// cards and the stage are drawn for a 1920 px wide screen; whatever the real window is, they are scaled to fit with a transform
const FIT = `<script>(()=>{const f=()=>{const zs=innerWidth/1920,s=document.getElementById('s');if(!s)return;s.style.transform='scale('+zs+')';s.style.transformOrigin='0 0';s.style.width='1920px';s.style.height=(innerHeight/zs)+'px';s.style.position='absolute';s.style.left='0';s.style.top='0';};addEventListener('resize',f);f();})();</script>`;
const cardHtml = (name) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${cardCss}</style></head><body><div id="s" style="display:grid;place-items:center"><div class="glow"></div>${cards[name]}</div>${FIT}</body></html>`;

// ------------------------------------------------------------------ the multi-device stage
const stageCss = `
  *{box-sizing:border-box;margin:0} html,body{height:100%}
  body{font-family:'Anek Latin',system-ui,sans-serif;background:#1b2246;color:#fff;overflow:hidden;position:relative}
  .glow{position:absolute;inset:0;background:radial-gradient(45% 55% at 50% 45%,rgba(243,167,18,.16),transparent 62%),radial-gradient(40% 40% at 10% 100%,rgba(110,130,255,.2),transparent 60%)}
  header{position:absolute;top:34px;left:0;right:0;text-align:center}
  header b{display:inline-block;font-size:30px;font-weight:620;font-stretch:112%;padding:10px 26px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff26}
  .row{position:absolute;inset:110px 30px 30px;display:flex;align-items:center;justify-content:center;gap:34px}
  .col{display:flex;flex-direction:column;align-items:center;gap:18px}
  .lab{font-size:23px;font-weight:560;color:#ffffffc8;text-align:center;line-height:1.25}
  .lab small{display:block;font-size:18px;font-weight:400;color:#ffffff88}
  .phone{width:340px;height:700px;border-radius:46px;background:#06081a;padding:13px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 2px #ffffff26;position:relative}
  .phone::before{content:"";position:absolute;top:20px;left:50%;width:84px;height:20px;margin-left:-42px;border-radius:12px;background:#000;z-index:3}
  .phone .vp{width:100%;height:100%;border-radius:34px;overflow:hidden;background:#fff}
  .phone iframe{width:388px;height:832px;border:0;transform:scale(.8093);transform-origin:0 0;background:#fff}
  .phone.big{width:480px;height:930px;border-radius:60px;padding:16px}
  .phone.big .vp{border-radius:46px}
  .phone.big iframe{width:414px;height:862px;border:0;transform:scale(1.1);transform-origin:0 0}
  .lap{display:flex;flex-direction:column;align-items:center}
  .lap .screen{width:1000px;height:640px;background:#0c0f20;border-radius:20px 20px 6px 6px;padding:14px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 2px #ffffff26}
  .lap .vp{width:100%;height:100%;overflow:hidden;border-radius:8px;background:#fff}
  .lap iframe{width:1255px;height:790px;border:0;transform:scale(.7746);transform-origin:0 0;background:#fff}
  .lap .base{width:1040px;height:16px;background:linear-gradient(#cfd4e4,#8f96b0);border-radius:0 0 22px 22px}
`;
const stageHtml = (kind, q) => {
  const title = q.get("title") ?? "";
  const dev = {
    ph: (src, label, sub) => `<div class="col"><div class="phone"><div class="vp"><iframe id="ph" src="${src}" allow="microphone"></iframe></div></div><div class="lab">${label}<small>${sub}</small></div></div>`,
    mob: (src, label, sub, big) => `<div class="col"><div class="phone${big ? " big" : ""}"><div class="vp"><iframe id="mob" src="${src}"></iframe></div></div><div class="lab">${label}<small>${sub}</small></div></div>`,
    lap: (src, label, sub) => `<div class="col"><div class="lap"><div class="screen"><div class="vp"><iframe id="lap" src="${src}"></iframe></div></div><div class="base"></div></div><div class="lab">${label}<small>${sub}</small></div></div>`,
  };
  const parts = [];
  if (q.get("ph")) parts.push(dev.ph(q.get("ph"), q.get("phl") ?? "Aai's phone", "An ordinary phone call, no app"));
  if (q.get("lap")) parts.push(dev.lap(q.get("lap"), "Rohan at the office", "The family website"));
  if (q.get("mob")) parts.push(dev.mob(q.get("mob"), "Rohan on the move", "The Heartline mobile app", q.get("big") === "1"));
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${stageCss}</style></head><body><div id="s"><div class="glow"></div>${title ? `<header><b>${title}</b></header>` : ""}<div class="row">${parts.join("")}</div></div>${FIT}</body></html>`;
};

// ------------------------------------------------------------------ driver helpers
const timeline = [];
const audioLog = []; // { kind: "haalo" | "parent", file, epoch } : where each sound belongs on the recorder's clock
let t0 = 0;
let t0Epoch = 0;
fs.mkdirSync(path.join(OUT, "audio"), { recursive: true });
const mark = (scene, note = "") => {
  const t = (Date.now() - t0) / 1000;
  timeline.push({ scene, t: Math.round(t * 10) / 10, note });
  console.log(`[${t.toFixed(1).padStart(6)}s] ${scene} ${note}`);
};
let cursor = { x: W * 0.55, y: H * 0.5 };

async function glide(page, x, y, ms = 650) {
  await page.mouse.move(x, y, { steps: Math.max(8, Math.round(ms / 16)) });
  cursor = { x, y };
}
async function reposition(page) {
  await page.mouse.move(cursor.x, cursor.y);
}
async function clickOn(page, locator, { pause = 250, ms = 650 } = {}) {
  const el = locator.first();
  await el.waitFor({ state: "visible", timeout: 30000 });
  await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  await sleep(150);
  const b = await el.boundingBox();
  if (!b) throw new Error("no box for click target");
  await glide(page, b.x + b.width / 2, b.y + b.height / 2, ms);
  await sleep(pause);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
  await sleep(250);
}
async function scrollTo(page, y, ms = 1800) {
  await page.evaluate(([top]) => window.scrollTo({ top, behavior: "smooth" }), [y]);
  await sleep(ms);
}
async function open(page, url, settle = 1200) {
  await page.goto(url.startsWith("http") ? url : BASE + url, { waitUntil: "load" });
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
  await reposition(page);
  await sleep(settle);
}
const showCard = async (page, name, ms) => {
  await open(page, `/__card/${name}`, 900);
  await sleep(ms);
};
const stage = async (page, kind, params, settle = 2500) => {
  await open(page, `/__stage/${kind}?${new URLSearchParams(params)}`, settle);
};
const frameOf = async (page, id) => (await page.locator(`#${id}`).elementHandle()).contentFrame();
const inFrame = (page, id) => page.frameLocator(`#${id}`);
const navFrame = async (page, id, url) => {
  const f = await frameOf(page, id);
  await f.goto(url, { waitUntil: "load" });
  await sleep(900);
};
const scrollFrameTo = async (page, id, elementId, ms = 1400) => {
  const f = await frameOf(page, id);
  await f.evaluate((el) => document.getElementById(el)?.scrollIntoView({ behavior: "smooth", block: "start" }), elementId);
  await sleep(ms);
};
const reloadFrame = async (page, id) => {
  const f = await frameOf(page, id);
  await f.goto(f.url(), { waitUntil: "load" });
  await sleep(900);
};

// --- the mother's phone page: data-state = ringing | connecting | live | ended, data-speaker = haalo | you | none
async function phoneState(page) {
  const f = await frameOf(page, "ph");
  return f.evaluate(() => ({ ...(document.querySelector("main")?.dataset ?? {}) }));
}
async function waitPhone(page, wanted, timeout = 30000) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const s = await phoneState(page).catch(() => ({}));
    if (wanted.includes(s.state)) return true;
    await sleep(250);
  }
  return false;
}
const VOICE = process.env.VOICE ?? "http://localhost:7860";
async function agentLines(callId) {
  if (!callId) return 0;
  try {
    const j = await (await fetch(`${VOICE}/live/${callId}?after=0`)).json();
    return j.items.filter((i) => i.kind === "agent").length;
  } catch {
    return 0;
  }
}
/** Waits for Sneha's next reply: written (the live feed grows) and then fully spoken (quiet for `quietMs`). */
async function haaloTurn(page, { startTimeout = 25000, quietMs = 4800, label = "Sneha" } = {}) {
  const first = await phoneState(page).catch(() => ({}));
  let lines = await agentLines(first.call);
  const t = Date.now();
  let spoke = false;
  let last = Date.now();
  let lastPoll = 0;
  while (Date.now() - t < 90000) {
    const s = await phoneState(page).catch(() => ({}));
    if (s.speaker === "haalo") {
      spoke = true;
      last = Date.now();
    }
    if (Date.now() - lastPoll > 1000) {
      lastPoll = Date.now();
      const n = await agentLines(s.call || first.call);
      if (n > lines) {
        lines = n;
        spoke = true;
        last = Date.now();
      }
    }
    if (spoke && s.speaker !== "haalo" && Date.now() - last > quietMs) return true;
    if (!spoke && Date.now() - t > startTimeout) {
      console.log(`  (no ${label} reply within ${startTimeout / 1000}s, carrying on)`);
      return false;
    }
    await sleep(200);
  }
  return spoke;
}
/** Waits until Sneha has actually said something matching `re` (the live feed), then until she has finished speaking it. */
async function haaloSays(page, re, { timeout = 30000, quietMs = 4200 } = {}) {
  const first = await phoneState(page).catch(() => ({}));
  const t = Date.now();
  let found = false;
  while (Date.now() - t < timeout) {
    const s = await phoneState(page).catch(() => ({}));
    try {
      const j = await (await fetch(`${VOICE}/live/${s.call || first.call}?after=0`)).json();
      if (j.items.some((i) => i.kind === "agent" && re.test(i.text))) {
        found = true;
        break;
      }
    } catch {}
    await sleep(500);
  }
  if (!found) console.log(`  (Sneha never said ${re}, carrying on)`);
  // let her finish: no speech for quietMs
  let last = Date.now();
  while (Date.now() - last < quietMs && Date.now() - t < timeout + 30000) {
    const s = await phoneState(page).catch(() => ({}));
    if (s.speaker === "haalo") last = Date.now();
    await sleep(200);
  }
  return found;
}
async function agentSaid(page, re) {
  const s = await phoneState(page).catch(() => ({}));
  try {
    const j = await (await fetch(`${VOICE}/live/${s.call}?after=0`)).json();
    return j.items.some((i) => i.kind === "agent" && re.test(i.text));
  } catch {
    return false;
  }
}
let recCount = 0;
/** Saves what Sneha said on the call that just ended (call before hanging up, and again after: only new tracks are returned). */
async function collectHaaloAudio(page) {
  try {
    const f = await frameOf(page, "ph");
    for (const r of await f.evaluate(() => window.__collectAudio?.() ?? [])) {
      const file = `${process.env.TAKE ?? "t"}-haalo-${String(++recCount).padStart(2, "0")}.webm`;
      fs.writeFileSync(path.join(OUT, "audio", file), Buffer.from(r.b64, "base64"));
      audioLog.push({ kind: "haalo", file, epoch: r.t0 });
    }
  } catch (e) {
    console.log("  (could not collect call audio:", String(e).slice(0, 80), ")");
  }
}
async function parentSays(page, name, i) {
  const f = await frameOf(page, "ph");
  const a = state.audio[name][i];
  const b64 = fs.readFileSync(path.join(here, "audio", a.file)).toString("base64");
  const epoch = Date.now();
  const secs = await f.evaluate((b) => window.__say(b), b64);
  audioLog.push({ kind: "parent", file: path.join("..", "tools", "demo-video", "audio", a.file), epoch });
  mark("parent says", `${name}[${i}] ${a.text}`);
  await sleep(secs * 1000 + 300);
}
async function answerCall(page) {
  const ringing = await waitPhone(page, ["ringing"], 12000);
  if (!ringing) throw new Error("the phone never rang");
  await sleep(3200); // let the viewer see it ring
  await clickOn(page, inFrame(page, "ph").getByRole("button", { name: "Answer" }), { ms: 800 });
  await waitPhone(page, ["live"], 25000);
}
async function hangUp(page) {
  await collectHaaloAudio(page); // before the page forgets the call
  const b = inFrame(page, "ph").getByRole("button", { name: "End call" });
  if (await b.count()) await clickOn(page, b);
}
const mobTab = (page, label) => clickOn(page, inFrame(page, "mob").getByRole("tab", { name: new RegExp(label, "i") }), { ms: 500 });

// ------------------------------------------------------------------ Cap (screen recorder) lifecycle
const cap = { id: null, path: null, startEpoch: 0 };
const capJson = (args) => JSON.parse(execFileSync(CAP_EXE, [...args, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
async function startCap() {
  const screens = capJson(["targets"]).screens;
  const screen = (screens.find((x) => x.primary) ?? screens[0]).id;
  cap.path = path.join(OUT, "cap", `demo-${Date.now()}.cap`);
  fs.mkdirSync(path.dirname(cap.path), { recursive: true });
  const log = fs.openSync(path.join(OUT, "cap", "start.log"), "w");
  // the detached recorder keeps its stdout open, so it must not be a pipe we wait on
  spawn(CAP_EXE, ["record", "start", "--screen", screen, "--system-audio", "--fps", "30", "--detach", "--path", cap.path, "--json"], { detached: true, stdio: ["ignore", log, log] }).unref();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const list = capJson(["record", "status"]);
    const mine = (Array.isArray(list) ? list : []).find((r) => r.status === "recording" && String(r.path).replace(/\\/g, "/").endsWith(path.basename(cap.path)));
    if (mine) {
      cap.id = mine.recordingId;
      cap.startEpoch = Date.now();
      console.log(`Cap is recording the screen (${cap.id})`);
      return;
    }
  }
  throw new Error("Cap did not start recording");
}
async function stopCap() {
  if (!cap.id) return null;
  capJson(["record", "stop", "--id", cap.id]);
  const mp4 = path.join(OUT, "cap", "cap-export.mp4");
  console.log("exporting the Cap recording...");
  execFileSync(CAP_EXE, ["export", cap.path, "--output", mp4, "--resolution", "2560x1600", "--quality", "social", "--json"], { stdio: ["ignore", "ignore", "inherit"] });
  return mp4;
}

// ------------------------------------------------------------------ main
if (CAP) await startCap();
const COMMON_ARGS = [
  "--autoplay-policy=no-user-gesture-required",
  "--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessChecks,LocalNetworkAccessChecksWebRTC,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
  "--force-color-profile=srgb",
];
let browser = null;
let context;
if (CAP) {
  // a visible app-mode window (no tabs, no address bar), full screen, in its own throw-away profile; Cap films the screen
  const profile = path.join(OUT, ".chrome-profile");
  fs.rmSync(profile, { recursive: true, force: true });
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: null,
    colorScheme: "light",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    permissions: ["microphone"],
    ignoreDefaultArgs: ["--enable-automation"],
    args: [...COMMON_ARGS, `--app=${BASE}/__card/title`, "--start-fullscreen", "--window-position=0,0", "--hide-scrollbars"],
  });
} else {
  browser = await chromium.launch({ headless: true, args: COMMON_ARGS });
  context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    permissions: ["microphone"],
    recordVideo: { dir: tmpVideos, size: { width: W, height: H } },
  });
}
await context.addInitScript(INIT);
await context.route("**/__card/*", (route) => {
  const name = new URL(route.request().url()).pathname.split("/").pop();
  route.fulfill({ status: 200, contentType: "text/html", body: cardHtml(name) });
});
await context.route("**/__stage/*", (route) => {
  const u = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: "text/html", body: stageHtml(u.pathname.split("/").pop(), u.searchParams) });
});
// the demo workspace cookie, so every page and frame is the demo family
await context.addCookies([{ name: "haalo_demo", value: "1", url: BASE }]);
const page = CAP ? (context.pages()[0] ?? (await context.newPage())) : await context.newPage();
page.setDefaultTimeout(45000);
t0 = Date.now();
t0Epoch = t0;
page.on("pageerror", (e) => console.log("  [page error]", e.message.slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [console error]", m.text().slice(0, 200));
});

const phoneUrl = (id) => `${BASE}/phone/${id}`;

try {
  // ---- 1. opening cards
  if (run("intro")) {
    mark("intro: title card");
    await showCard(page, "title", 5500);
    mark("intro: the problem");
    await showCard(page, "problem", 9500);
    mark("intro: meet the family");
    await showCard(page, "cast", 6500);
  }

  // ---- 2. landing page
  if (run("landing")) {
    mark("landing page");
    await open(page, "/", 1800);
    await glide(page, W * 0.6, H * 0.5, 900);
    await sleep(2500);
    await clickOn(page, page.getByRole("radio", { name: "हिन्दी" }));
    await sleep(1000);
    await scrollTo(page, 900, 2200);
    await page.evaluate(() => document.getElementById("care")?.scrollIntoView({ behavior: "smooth" }));
    mark("landing: the care loop");
    await sleep(5200);
    await scrollTo(page, (await page.evaluate(() => document.getElementById("care").getBoundingClientRect().top + window.scrollY)) + 560, 2600);
    await sleep(3200);
    await page.evaluate(() => document.getElementById("languages")?.scrollIntoView({ behavior: "smooth" }));
    mark("landing: languages");
    await sleep(4200);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(1800);
  }

  // ---- 3. morning: Rohan is at the office, Sneha calls Aai
  if (run("morning")) {
    mark("morning: the three screens");
    await stage(page, "trio", {
      title: "Rohan is at the office. Aai is at home in Pune.",
      ph: phoneUrl(P.aai.id), lap: `${BASE}/app?p=${P.aai.id}`, mob: `${MOBILE}/`,
    }, 3500);
    await sleep(4500);
    mark("morning: Rohan taps Call now");
    await clickOn(page, inFrame(page, "lap").getByRole("button", { name: /Call Aai now/i }), { ms: 900 });
    await sleep(900);
    mark("morning: Aai's phone rings");
    await answerCall(page);
    mark("morning: Aai answers");
    await haaloTurn(page, { startTimeout: 30000, label: "opening" });
    const NEWS = /92|नव्वद|Aarav|आराव|आरव/;
    const ASK = /पुरण/;
    await parentSays(page, "aai_checkin", 0);
    await haaloTurn(page, { quietMs: 4200 });
    if (!(await agentSaid(page, NEWS))) {
      await parentSays(page, "aai_checkin", 4); // "go on, what does Rohan say?"
      await haaloSays(page, NEWS);
    }
    mark("morning: Sneha passes on Rohan's news");
    await parentSays(page, "aai_checkin", 1);
    if (!(await agentSaid(page, ASK))) await haaloSays(page, ASK, { timeout: 25000 });
    else await haaloTurn(page, { quietMs: 4200 });
    mark("morning: Sneha asks Rohan's question");
    await parentSays(page, "aai_checkin", 2);
    await haaloTurn(page, { quietMs: 4200 });
    await parentSays(page, "aai_checkin", 3);
    await haaloTurn(page, { quietMs: 4200 });
    await sleep(1200);
    await hangUp(page);
    mark("morning: call ends, the summary is written");
    await sleep(11000); // summary, dose confirmations, the family's notification
    mark("morning: the update lands on Rohan's phone");
    await sleep(3000);
    await reloadFrame(page, "lap");
    mark("morning: and on his laptop");
    await sleep(5000);
  }

  // ---- 4. aftermath: the website in detail
  if (run("aftermath")) {
    await open(page, `/app?p=${P.aai.id}`, 1500);
    mark("website: today");
    await sleep(3500);
    await scrollTo(page, 560, 2000);
    await sleep(3200);
    await scrollTo(page, 1150, 2000);
    await sleep(2400);
    await open(page, `/app/messages?p=${P.aai.id}`, 1500);
    mark("website: Aai's answer to Rohan's question");
    await sleep(3200);
    await scrollTo(page, 420, 1800);
    await sleep(3800);
  }

  // ---- 5. medicine reminder in the evening
  if (run("reminder")) {
    mark("reminder: the evening dose");
    await stage(page, "duo", {
      title: "A dose is due. Sneha makes a short reminder call.",
      ph: phoneUrl(P.aai.id), lap: `${BASE}/app/medicines?p=${P.aai.id}`,
    }, 3000);
    await sleep(3000);
    mark("reminder: Rohan taps Remind now");
    await clickOn(page, inFrame(page, "lap").getByRole("button", { name: /Remind Aai now/i }), { ms: 900 });
    await sleep(900);
    await answerCall(page);
    await haaloTurn(page, { startTimeout: 30000, label: "opening" });
    await parentSays(page, "aai_reminder", 0);
    await haaloTurn(page, { quietMs: 4200 });
    await parentSays(page, "aai_reminder", 1);
    await haaloTurn(page, { quietMs: 2800 });
    await sleep(1000);
    await hangUp(page);
    mark("reminder: call ends");
    await sleep(5500);
    await reloadFrame(page, "lap");
    mark("reminder: the dose is confirmed on the website");
    await sleep(5000);
  }

  // ---- 6. emergency: Appa falls
  if (run("emergency")) {
    mark("emergency: Appa's morning call");
    await stage(page, "trio", {
      title: "A different morning. Appa, in Chennai, takes the call.",
      ph: phoneUrl(P.appa.id), phl: "Appa's phone", lap: `${BASE}/app/health?p=${P.appa.id}`, mob: `${MOBILE}/`,
    }, 3500);
    await sleep(2500);
    // Rohan, on the move, taps Appa then Call now in the mobile app
    mark("emergency: Rohan calls from the mobile app");
    await clickOn(page, inFrame(page, "mob").getByRole("button", { name: "Appa" }), { ms: 800 });
    await sleep(900);
    await clickOn(page, inFrame(page, "mob").getByRole("button", { name: /Call Appa now/i }), { ms: 800 });
    await answerCall(page);
    await haaloTurn(page, { startTimeout: 30000, label: "opening" });
    await parentSays(page, "appa_checkin", 0);
    await haaloTurn(page, { quietMs: 4200 });
    mark("emergency: Appa reads out his blood pressure");
    await parentSays(page, "appa_checkin", 1);
    await haaloTurn(page, { quietMs: 4200 });
    await parentSays(page, "appa_checkin", 2);
    await haaloTurn(page, { quietMs: 2400 });
    mark("emergency: Appa says he fell");
    await parentSays(page, "appa_checkin", 3);
    await navFrame(page, "lap", `${BASE}/app/safety?p=${P.appa.id}`);
    await scrollFrameTo(page, "lap", "hist-h", 1200);
    await haaloTurn(page, { quietMs: 3000, startTimeout: 25000, label: "emergency" });
    mark("emergency: the alert ladder starts, Rohan's phone buzzes");
    await sleep(4500);
    await mobTab(page, "Alerts");
    mark("emergency: the alert on the mobile app");
    await sleep(9000);
    await hangUp(page);
    mark("emergency: the ladder works down the contacts");
    await sleep(14000);
    mark("emergency: nobody has answered yet");
    await sleep(9000);
    const ack = inFrame(page, "lap").getByRole("button", { name: /I am on it/i }).first();
    await ack.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    if (await ack.count()) {
      mark("emergency: Rohan takes over");
      await clickOn(page, ack, { ms: 900 });
      await sleep(4500);
    }
  }

  // ---- 7. the parent calls Sneha
  if (run("inbound")) {
    mark("inbound: Dadi ji calls Sneha");
    await stage(page, "duo", {
      title: "Dadi ji can call Sneha any time. Hindi, this time.",
      ph: phoneUrl(P.dadi.id), phl: "Dadi ji's phone", lap: `${BASE}/app?p=${P.dadi.id}`,
    }, 3000);
    await sleep(2500);
    await clickOn(page, inFrame(page, "ph").getByRole("button", { name: /Call Sneha/i }), { ms: 900 });
    await waitPhone(page, ["live"], 25000);
    await haaloTurn(page, { startTimeout: 30000, label: "opening" });
    await parentSays(page, "dadi_inbound", 0);
    await haaloTurn(page, { quietMs: 4200 });
    await parentSays(page, "dadi_inbound", 1);
    await haaloTurn(page, { quietMs: 4200 });
    await sleep(800);
    await hangUp(page);
    await sleep(2500);
  }

  // ---- 8. photo proof
  if (run("photo")) {
    mark("photo proof");
    await stage(page, "duo", {
      title: "Aai's smartphone: a photo instead of a call (optional).",
      ph: `${BASE}/p/${P.aai.proof_token}`, phl: "Aai's phone: one big button", lap: `${BASE}/app/health?p=${P.aai.id}`,
    }, 3000);
    await sleep(2500);
    await clickOn(page, inFrame(page, "ph").getByRole("button", { name: /Take a photo/i }), { ms: 900 });
    await inFrame(page, "ph").locator("#photo").setInputFiles(path.join(here, "bp_reading.jpg"));
    mark("photo proof: Sneha reads the photo");
    await inFrame(page, "ph").getByRole("status").waitFor({ timeout: 40000 }).catch(() => {});
    await sleep(3500);
    await reloadFrame(page, "lap");
    mark("photo proof: the reading is on the dashboard");
    const f = await frameOf(page, "lap");
    await f.evaluate(() => window.scrollTo({ top: 460, behavior: "smooth" }));
    await sleep(5500);
  }

  // ---- 9. the mobile app, up close
  if (run("mobile")) {
    mark("mobile app tour");
    await stage(page, "solo", { title: "Rohan's mobile app", mob: `${MOBILE}/`, big: "1" }, 3500);
    await sleep(3500);
    const m = inFrame(page, "mob");
    await mobTab(page, "Medicines");
    mark("mobile: medicines");
    await sleep(4500);
    await mobTab(page, "Health");
    mark("mobile: health");
    await sleep(5000);
    await mobTab(page, "More");
    await sleep(1200);
    await clickOn(page, m.getByRole("button", { name: /^Trends/ }), { ms: 600 });
    mark("mobile: trends");
    await sleep(4500);
    await clickOn(page, m.getByRole("button", { name: /Back/ }), { ms: 500 });
    await sleep(700);
    await mobTab(page, "More");
    await sleep(900);
    await clickOn(page, m.getByRole("button", { name: /^Messages/ }), { ms: 600 });
    mark("mobile: messages");
    await sleep(4500);
    await clickOn(page, m.getByRole("button", { name: /Back/ }), { ms: 500 });
    await sleep(700);
    await mobTab(page, "More");
    await sleep(900);
    await clickOn(page, m.getByRole("button", { name: /^Safety/ }), { ms: 600 });
    mark("mobile: safety");
    await sleep(4500);
  }

  // ---- 10. the rest of the website
  if (run("web")) {
    await open(page, `/app/insights?p=${P.appa.id}`, 1500);
    mark("website: trends");
    await sleep(4000);
    await scrollTo(page, 560, 2000);
    await sleep(4200);
    await open(page, `/app/calendar?p=${P.aai.id}`, 1500);
    mark("website: calendar");
    await sleep(3500);
    await scrollTo(page, 420, 1600);
    await sleep(3000);
    await open(page, `/app/safety?p=${P.appa.id}`, 1500);
    mark("website: the alert history");
    await sleep(2500);
    await scrollTo(page, 640, 2200);
    await sleep(4500);
    await open(page, `/app/family`, 1500);
    mark("website: the family circle");
    await sleep(3500);
  }

  // ---- 11. closing card
  if (run("outro")) {
    mark("closing card");
    await showCard(page, "closing", 8000);
  }
} finally {
  const total = (Date.now() - t0) / 1000;
  mark("end", `total ${total.toFixed(1)}s`);
  const video = CAP ? null : page.video();
  await context.close();
  await browser?.close();
  const mp4 = path.join(OUT, ONLY.length ? `haalo-demo-${ONLY.join("-")}.mp4` : "haalo-demo.mp4");
  if (CAP) {
    const exported = await stopCap();
    if (exported) fs.copyFileSync(exported, mp4);
    fs.writeFileSync(path.join(OUT, "cap", "sync.json"), JSON.stringify({ t0Epoch, capStartEpoch: cap.startEpoch }, null, 2));
  } else {
    const raw = await video.path();
    console.log("encoding", raw);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  }
  fs.writeFileSync(path.join(OUT, ONLY.length ? "timeline-partial.json" : "timeline.json"), JSON.stringify({ total: Math.round(total * 10) / 10, t0Epoch, scenes: timeline, audio: audioLog }, null, 2));
  console.log("wrote", mp4);
}
