// Builds the Heartline pitch deck (deck/heartline-pitch-deck.pptx).  Run: node build.js
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const Lu = require("react-icons/lu");
const { applyTheme } = require(process.env.APPLY_THEME || "C:/Users/shaun/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/local-agent-mode-sessions/skills-plugin/4179200e-1536-4c72-8924-443e8c12f1f4/9bb334ac-22a5-437d-8a7e-7d312ce13dcf/skills/pptx/scripts/apply_theme.js");

// ---- the product's own palette (packages/ui-tokens)
const P = {
  ink: "1B2246", inkSoft: "252D57", inkLift: "2F386A", morning: "EEF2F8", surface: "FFFFFF", surfaceAlt: "E3E9F4",
  marigold: "F3A712", marigoldDeep: "C98500", tulsi: "3C8A5A", tulsiInk: "2B6B44", tulsiBg: "DDF0E4",
  sindoor: "C8352C", sindoorBg: "FDEEEC", mist: "8A93AD", slate: "525C7E", border: "D5DCEA", soft: "AEB6D0",
};
const THEME = {
  name: "Heartline",
  headFontFace: "Arial",
  bodyFontFace: "Calibri",
  colors: {
    dk1: P.ink, lt1: P.surface, dk2: P.inkSoft, lt2: P.morning,
    accent1: P.marigold, accent2: P.tulsi, accent3: P.sindoor, accent4: P.slate, accent5: P.mist, accent6: P.marigoldDeep,
    hlink: P.marigoldDeep, folHlink: P.slate,
  },
};
const HEAD = "Arial";
const BODY = "Calibri";
const IMG = (n) => path.join(__dirname, "img", n);

async function icon(name, color, size = 256) {
  const C = Lu[name];
  if (!C) throw new Error("no icon " + name);
  const svg = renderToStaticMarkup(React.createElement(C, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
  pres.title = "Heartline: a daily call for the people who raised you";
  pres.author = "Heartline";
  pres.company = "Heartline";
  pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };
  const C = pres.SchemeColor;

  // ---- layouts: one light, one dark; the footer lives on the layout
  const footer = (color) => [
    { text: { text: "Heartline  ·  Symphony 2026 buildathon", options: { x: 0.6, y: 7.02, w: 6, h: 0.3, fontFace: BODY, fontSize: 10, color, margin: 0 } } },
  ];
  pres.defineSlideMaster({ title: "LIGHT", background: { color: P.morning }, objects: footer(P.mist), slideNumber: { x: 12.2, y: 7.02, w: 0.55, h: 0.3, fontFace: BODY, fontSize: 10, color: P.mist, align: "right" } });
  pres.defineSlideMaster({ title: "DARK", background: { color: P.ink }, objects: footer(P.soft), slideNumber: { x: 12.2, y: 7.02, w: 0.55, h: 0.3, fontFace: BODY, fontSize: 10, color: P.soft, align: "right" } });

  const ic = {};
  const need = {
    ink: ["LuPhoneCall", "LuUsers", "LuSiren", "LuPill", "LuHeartPulse", "LuMessageCircleHeart", "LuPhoneIncoming", "LuChartLine", "LuCalendarHeart", "LuMic", "LuShieldCheck", "LuLock", "LuBrain", "LuEye", "LuFileText", "LuBellRing", "LuCheck", "LuLanguages", "LuServer", "LuSmartphone", "LuDatabase", "LuLayers", "LuBuilding2", "LuTrendingUp", "LuStethoscope", "LuGlobe", "LuCpu", "LuSettings2", "LuFlaskConical", "LuClock", "LuCamera", "LuSparkles"],
    white: ["LuPhoneCall", "LuUsers", "LuSiren", "LuCheck", "LuBellRing", "LuMic", "LuHeartPulse"],
  };
  for (const [k, names] of Object.entries(need)) {
    ic[k] = {};
    for (const n of names) ic[k][n] = await icon(n, k === "ink" ? P.ink : P.surface);
  }
  const iconCircle = (s, name, x, y, d = 0.62, fill = P.marigold, tone = "ink") => {
    s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
    const pad = d * 0.24;
    s.addImage({ data: ic[tone][name], x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, altText: name.replace("Lu", "") + " icon" });
  };
  const card = (s, x, y, w, h, fill = P.surface, name = "card") =>
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.16, fill: { color: fill }, line: { color: fill === P.surface ? P.border : fill, width: 0.75 },
      shadow: fill === P.surface ? { type: "outer", color: "1B2246", opacity: 0.1, blur: 10, offset: 2, angle: 90 } : undefined,
      objectName: name,
    });
  const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontFace: BODY, color: P.ink, valign: "top", ...o });
  const title = (s, text, dark = false) =>
    T(s, text, { x: 0.6, y: 0.42, w: 12.1, h: 0.9, fontFace: HEAD, bold: true, fontSize: 34, color: dark ? P.morning : P.ink, valign: "middle", objectName: "Title" });
  const kicker = (s, text, dark = false) =>
    T(s, text.toUpperCase(), { x: 0.6, y: 0.2, w: 8, h: 0.28, fontSize: 12, bold: true, charSpacing: 3, color: dark ? P.marigold : P.marigoldDeep });
  const source = (s, text, dark = false) => T(s, text, { x: 0.6, y: 6.62, w: 12.1, h: 0.32, fontSize: 10, italic: true, color: dark ? P.soft : P.slate });
  const shot = (s, file, x, y, w, alt) => {
    const h = (w * 9) / 16;
    s.addShape(pres.ShapeType.roundRect, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.14, fill: { color: P.surface }, line: { color: P.border, width: 0.75 }, shadow: { type: "outer", color: "1B2246", opacity: 0.18, blur: 14, offset: 3, angle: 90 } });
    s.addImage({ path: IMG(file), x, y, w, h, altText: alt, rounding: false });
    return h;
  };

  // ============================================================== 1. Title
  {
    pres.addSection({ title: "Open" });
    const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Open" });
    // the orb with its rings, as on the landing page
    const ox = 10.7, oy = 3.55;
    [[3.9, 0.25], [3.1, 0.35], [2.4, 0.5]].forEach(([d, t]) =>
      s.addShape(pres.ShapeType.ellipse, { x: ox - d / 2, y: oy - d / 2, w: d, h: d, fill: { color: P.ink, transparency: 100 }, line: { color: P.marigold, width: 1, transparency: Math.round((1 - t) * 100) }, objectName: "ring" }));
    s.addShape(pres.ShapeType.ellipse, { x: ox - 0.95, y: oy - 0.95, w: 1.9, h: 1.9, fill: { color: P.marigold }, line: { color: "F6C453", width: 3 }, shadow: { type: "outer", color: P.marigold, opacity: 0.5, blur: 30, offset: 0, angle: 90 }, objectName: "orb" });
    T(s, "SYMPHONY 2026  ·  VOICE AI BUILDATHON", { x: 0.8, y: 1.45, w: 8, h: 0.3, fontSize: 13, bold: true, charSpacing: 3, color: P.marigold });
    T(s, "Heartline", { x: 0.8, y: 1.95, w: 8, h: 1.3, fontFace: HEAD, bold: true, fontSize: 72, color: P.morning, valign: "middle", objectName: "Title" });
    T(s, "A daily call for the people who raised you.", { x: 0.8, y: 3.35, w: 8.3, h: 0.9, fontFace: HEAD, bold: true, fontSize: 26, color: P.marigold });
    T(s, "Meet Sneha, the AI voice that phones your parents every morning, in their own language, on an ordinary phone, and tells you how they are.", { x: 0.8, y: 4.5, w: 7.3, h: 1.1, fontSize: 18, color: P.soft });
    const chips = ["No app for the parent", "10 Indian languages", "Escalates to a human"];
    let cx = 0.8;
    chips.forEach((c) => {
      const w = 0.32 + c.length * 0.115;
      s.addShape(pres.ShapeType.roundRect, { x: cx, y: 5.95, w, h: 0.42, rectRadius: 0.21, fill: { color: P.inkSoft }, line: { color: P.inkLift, width: 0.75 } });
      T(s, c, { x: cx, y: 5.95, w, h: 0.42, fontSize: 13, color: P.morning, align: "center", valign: "middle" });
      cx += w + 0.18;
    });
    s.addNotes("Open with the line: a daily call for the people who raised you. Heartline is the product; Sneha is the voice. One sentence on what it does: she phones a parent on an ordinary phone, in their language, checks medicines and mood, and tells the family.");
  }

  // ============================================================== 2. Problem
  {
    pres.addSection({ title: "Problem" });
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Problem" });
    kicker(s, "The problem");
    title(s, "Parents age alone, and families live far away");
    const stats = [
      ["194M", "Indians aged 60+ by 2031, up from 138M in 2021", "MoSPI, Elderly in India 2021 (projection)"],
      ["347M", "by 2050: one in five Indians will be over 60 (20.8%)", "UNFPA, India Ageing Report"],
      ["~50%", "of patients on long-term treatment take medicines as prescribed in developed countries, and fewer elsewhere", "WHO, Adherence to Long-Term Therapies, 2003"],
    ];
    stats.forEach(([n, l, src], i) => {
      const x = 0.6 + i * 4.1;
      card(s, x, 1.65, 3.9, 3.55, P.ink, "stat card");
      T(s, n, { x: x + 0.35, y: 1.85, w: 3.2, h: 1.2, fontFace: HEAD, bold: true, fontSize: 60, color: P.marigold, valign: "middle" });
      T(s, l, { x: x + 0.35, y: 3.1, w: 3.2, h: 1.25, fontSize: 16, color: P.morning });
      T(s, src, { x: x + 0.35, y: 4.5, w: 3.2, h: 0.5, fontSize: 11, italic: true, color: P.soft });
    });
    card(s, 0.6, 5.45, 12.1, 1.05, P.surface, "gap");
    iconCircle(s, "LuPhoneCall", 0.85, 5.66, 0.62);
    T(s, [
      { text: "The gap: ", options: { bold: true } },
      { text: "reminder apps, wearables and portals all need the parent to install, charge or open something. A phone call needs nothing, and every parent already answers one." },
    ], { x: 1.75, y: 5.55, w: 10.7, h: 0.85, fontSize: 16, valign: "middle" });
    source(s, "Sources: Ministry of Statistics (MoSPI); UNFPA India Ageing Report; WHO (2003). The WHO 50% figure is an often-cited average that later reviews have questioned.");
    s.addNotes("Lead with the demographic wave: 138 million over-60s in 2021 heading to 194 million by 2031 (MoSPI projection) and 347 million by 2050 (UNFPA). Then the adherence problem: WHO's widely quoted figure is that about half of patients on long-term therapy do not take medicines as prescribed. Mention the caveat if asked: it is an average, and later reviews question its evidence base. Close on the gap: every existing answer needs the parent to install or charge something.");
  }

  // ============================================================== 3. Why now
  {
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Problem" });
    kicker(s, "Why now");
    title(s, "Voice AI in India has gone from demo to production");
    const cards = [
      ["LuLanguages", "Razorpay x Sarvam", "Voice-led commerce in Indian languages; Swiggy among the first to pilot it.", "March 2026 announcement"],
      ["LuLayers", "Razorpay Agent Studio", "A platform for agents on payment rails, with Sarvam's Indic speech stack integrated.", "March 2026"],
      ["LuPhoneCall", "Agents making real calls", "Razorpay reports Hinglish outbound voice agents across churn recovery, adoption and incidents: 35,000+ calls.", "Vendor-reported, ElevenLabs Summit India 2026"],
    ];
    for (let i = 0; i < 3; i++) {
      const [ik, h, b, tag] = cards[i];
      const x = 0.6 + i * 4.1;
      card(s, x, 1.65, 3.9, 3.3, P.surface, "why now card");
      iconCircle(s, ik, x + 0.35, 1.95, 0.7);
      T(s, h, { x: x + 0.35, y: 2.85, w: 3.2, h: 0.4, fontFace: HEAD, bold: true, fontSize: 19 });
      T(s, b, { x: x + 0.35, y: 3.35, w: 3.2, h: 1.1, fontSize: 15, color: P.slate });
      T(s, tag, { x: x + 0.35, y: 4.5, w: 3.2, h: 0.35, fontSize: 11, italic: true, color: P.mist });
    }
    card(s, 0.6, 5.2, 12.1, 1.3, P.ink, "takeaway");
    T(s, [
      { text: "Y Combinator co-presents this buildathon, and the winner earns a YC interview. ", options: { bold: true, color: P.marigold } },
      { text: "These deployments serve commerce and collections. Heartline points the same technology at something people never get enough of: care for their parents.", options: { color: P.morning } },
    ], { x: 0.95, y: 5.3, w: 11.4, h: 1.1, fontSize: 17, valign: "middle" });
    source(s, "Sources: Storyboard18 and Swarajya (Razorpay x Sarvam, Mar 2026); Razorpay Agent Studio launch coverage; ElevenLabs Summit India 2026 session; Bolna Symphony 2026 page.");
    s.addNotes("This slide is the market context judges will recognise. Razorpay and Sarvam announced voice-led commerce in Indian languages in March 2026, with Swiggy piloting. Razorpay also reports 35,000+ outbound Hinglish agent calls; that figure comes from a vendor session, so say 'reported'. The point: the technology is proven for business calls. We apply it to the family.");
  }

  // ============================================================== 4. Solution
  {
    pres.addSection({ title: "Solution" });
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Solution" });
    kicker(s, "The solution");
    title(s, "Heartline: one phone call that looks after your parent");
    const rows = [
      ["LuPhoneCall", "Sneha calls, in her language", "An AI voice on the parent's ordinary phone. She says who she is and who she is calling for, then has a warm, unhurried chat."],
      ["LuUsers", "The family sees what matters", "A two-line summary, mood, medicines taken, readings and answers, on the website and in the mobile app."],
      ["LuSiren", "Alerts reach a human", "A fall or chest pain alerts the whole family, then emergency contacts in order, until someone takes over."],
    ];
    rows.forEach(([ik, h, b], i) => {
      const y = 1.7 + i * 1.65;
      iconCircle(s, ik, 0.6, y, 0.7);
      T(s, h, { x: 1.55, y: y - 0.03, w: 3.9, h: 0.4, fontFace: HEAD, bold: true, fontSize: 18 });
      T(s, b, { x: 1.55, y: y + 0.42, w: 3.9, h: 1.1, fontSize: 14, color: P.slate });
    });
    shot(s, "trio.png", 5.75, 1.75, 6.95, "Heartline on three screens: Aai's phone call with Sneha, the family website and the mobile app");
    T(s, "Live product: Aai's phone, Rohan's laptop at work, and Rohan's mobile app", { x: 5.75, y: 5.78, w: 6.95, h: 0.35, fontSize: 12, italic: true, color: P.slate, align: "center" });
    s.addNotes("Show the three screens at once. Left: Aai's phone mid-call with Sneha in Marathi. Middle: Rohan's laptop at work. Right: Rohan's mobile app. Nothing is mocked: this is the real product running against a real database.");
  }

  // ============================================================== 5. How it works
  {
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Solution" });
    kicker(s, "How it works");
    title(s, "From the first ring to the family's phone");
    const steps = [
      ["LuClock", "Trigger", "A daily window, a due dose, the family's Call now, or the parent calling in."],
      ["LuMic", "Introduce", "\"I'm Sneha from Heartline, calling on behalf of Rohan.\" Consent on the first call."],
      ["LuBrain", "Understand", "Speech to text, a safety check on every turn, then the model replies with tools."],
      ["LuCheck", "Act", "Confirms doses, logs readings, passes on notes, raises alerts. Each with evidence."],
      ["LuBellRing", "Tell the family", "Summary and notification within seconds, and the alert ladder if needed."],
    ];
    steps.forEach(([ik, h, b], i) => {
      const x = 0.6 + i * 2.45;
      card(s, x, 1.65, 2.25, 2.85, P.surface, "step");
      s.addShape(pres.ShapeType.ellipse, { x: x + 0.2, y: 1.85, w: 0.4, h: 0.4, fill: { color: P.ink }, line: { color: P.ink, width: 0 } });
      T(s, String(i + 1), { x: x + 0.2, y: 1.85, w: 0.4, h: 0.4, fontSize: 14, bold: true, color: P.morning, align: "center", valign: "middle" });
      iconCircle(s, ik, x + 1.45, 1.8, 0.6);
      T(s, h, { x: x + 0.2, y: 2.6, w: 1.9, h: 0.4, fontFace: HEAD, bold: true, fontSize: 17 });
      T(s, b, { x: x + 0.2, y: 3.05, w: 1.9, h: 1.55, fontSize: 13, color: P.slate });
    });
    // a real exchange
    card(s, 0.6, 4.8, 12.1, 1.75, P.ink, "example");
    T(s, "A REAL CALL, TRANSLATED FROM MARATHI", { x: 0.9, y: 4.95, w: 6, h: 0.28, fontSize: 11, bold: true, charSpacing: 2, color: P.marigold });
    s.addShape(pres.ShapeType.roundRect, { x: 0.9, y: 5.32, w: 5.4, h: 0.52, rectRadius: 0.12, fill: { color: P.inkSoft }, line: { color: P.inkLift, width: 0.5 } });
    T(s, "Sneha: Namaskar Aai, I'm Sneha from Heartline, calling on behalf of Rohan. How are you today?", { x: 1.02, y: 5.32, w: 5.2, h: 0.52, fontSize: 12, color: P.morning, valign: "middle" });
    s.addShape(pres.ShapeType.roundRect, { x: 2.9, y: 5.95, w: 3.4, h: 0.4, rectRadius: 0.12, fill: { color: P.marigoldDeep }, line: { color: P.marigoldDeep, width: 0 } });
    T(s, "Aai: I'm fine. I took my medicine.", { x: 3.0, y: 5.95, w: 3.2, h: 0.4, fontSize: 12, color: P.surface, valign: "middle" });
    const res = ["Dose confirmed", "Rohan's note delivered", "Her answer sent back"];
    res.forEach((r, i) => {
      const w = 2.05, x = 6.75 + (i % 2) * 2.95, y = 5.4 + Math.floor(i / 2) * 0.6;
      s.addShape(pres.ShapeType.roundRect, { x, y, w: 2.75, h: 0.42, rectRadius: 0.21, fill: { color: P.tulsiBg }, line: { color: P.tulsiBg, width: 0 } });
      T(s, r, { x: x + 0.15, y, w: 2.5, h: 0.42, fontSize: 13, bold: true, color: P.tulsiInk, valign: "middle" });
    });
    s.addNotes("Walk the five steps left to right. Stress step 2: every call opens by saying who Sneha is and on whose behalf she calls; the first call also asks permission. Step 3: the safety layer runs on every turn, before the model answers. Step 4: actions are tool calls with evidence quotes, not guesses. The example is a real Marathi call from the demo.");
  }

  // ============================================================== 6. Features
  {
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Solution" });
    kicker(s, "The care loop");
    title(s, "Everything a worried son or daughter would want");
    const f = [
      ["LuMessageCircleHeart", "Daily check-in", "A warm chat about mood, meals, sleep and aches."],
      ["LuPill", "Medicine reminders", "Short calls, retries, and a family alert on a missed dose."],
      ["LuCamera", "Photo readings", "BP and sugar logged; out-of-range values alert the family."],
      ["LuUsers", "Notes and questions", "Rohan's message goes in, and Aai's answer comes back."],
      ["LuPhoneIncoming", "Inbound line", "Parents can call Sneha for today's doses and appointments."],
      ["LuSiren", "Emergency ladder", "Everyone first, then contacts in order, until a human answers."],
      ["LuTrendingUp", "Weekly trends", "A weekly digest of mood, sleep, appetite, adherence and BP."],
      ["LuCalendarHeart", "Festivals, visits", "Greetings in the family's tradition; doctor visits mentioned."],
    ];
    f.forEach(([ik, h, b], i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 0.6 + col * 3.07, y = 1.7 + row * 2.45;
      card(s, x, y, 2.9, 2.25, P.surface, "feature");
      iconCircle(s, ik, x + 0.25, y + 0.25, 0.6);
      T(s, h, { x: x + 0.25, y: y + 1.0, w: 2.45, h: 0.4, fontFace: HEAD, bold: true, fontSize: 15 });
      T(s, b, { x: x + 0.25, y: y + 1.42, w: 2.45, h: 0.78, fontSize: 13, color: P.slate });
    });
    s.addNotes("Eight capabilities, all built and demonstrated. Pick two to dwell on: the medicine reminder with family alert on a miss, and the emergency ladder. Readings by photo is optional for parents with a smartphone: one big button, the model reads the number, the family is told.");
  }

  // ============================================================== 7. Safety
  {
    pres.addSection({ title: "Trust" });
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Trust" });
    kicker(s, "Safety and trust");
    title(s, "Built for the worst minute, not the average day");
    shot(s, "emergency.png", 0.6, 1.75, 6.3, "The alert ladder after Appa says he fell: family notified, then contacts called in order");
    T(s, "Appa says he fell: the alert ladder runs, and every step is logged", { x: 0.6, y: 5.45, w: 6.3, h: 0.35, fontSize: 12, italic: true, color: P.slate, align: "center" });
    const g = [
      ["LuShieldCheck", "Honest by design", "Says she is an AI on every call, asks permission first, and stops if declined."],
      ["LuStethoscope", "Never gives medical advice", "Alerts on thresholds the family set. It records, it does not diagnose."],
      ["LuEye", "Evidence for every flag", "Each safety decision stores the exact words that triggered it."],
      ["LuLock", "Private by default", "Text transcripts only; audio is opt-in. Access is limited to the family by row-level security."],
    ];
    g.forEach(([ik, h, b], i) => {
      const y = 1.7 + i * 1.18;
      iconCircle(s, ik, 7.35, y, 0.6);
      T(s, h, { x: 8.2, y: y - 0.04, w: 4.5, h: 0.36, fontFace: HEAD, bold: true, fontSize: 16 });
      T(s, b, { x: 8.2, y: y + 0.34, w: 4.5, h: 0.75, fontSize: 13, color: P.slate });
    });
    s.addNotes("Judges will ask about safety first. Four answers: honest disclosure and consent, no medical advice, evidence quotes on every flag, and privacy defaults. The screenshot shows the emergency ladder: the whole family is notified, then contacts are called in priority order, and the ladder stops when a human acknowledges. Without a telephony number the call and SMS steps are shown as simulated, and the in-app alerts are real.");
  }

  // ============================================================== 8. Architecture
  {
    pres.addSection({ title: "Technical" });
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Technical" });
    kicker(s, "Architecture");
    title(s, "A cascade pipeline behind clean interfaces");
    const box = (x, y, w, h, text, o = {}) => {
      s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: o.fill ?? P.surface }, line: { color: o.line ?? P.border, width: 0.75 }, shadow: o.fill ? undefined : { type: "outer", color: "1B2246", opacity: 0.08, blur: 6, offset: 1, angle: 90 } });
      T(s, text, { x: x + 0.08, y, w: w - 0.16, h, fontSize: o.size ?? 13, bold: o.bold ?? false, color: o.color ?? P.ink, align: "center", valign: "middle" });
    };
    const arrow = (x1, y1, x2, y2, color = P.slate) =>
      s.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipV: y2 < y1, line: { color, width: 1.75, endArrowType: "triangle" } });
    // top row: who
    box(0.6, 1.55, 2.85, 0.85, "Parent's phone\n(ordinary call)", { bold: true });
    box(3.65, 1.55, 2.85, 0.85, "Browser demo\n(WebRTC, no number)", { bold: true });
    box(7.0, 1.55, 2.85, 0.85, "Family website\nNext.js 16", { bold: true });
    box(10.1, 1.55, 2.6, 0.85, "Family app\nExpo SDK 57", { bold: true });
    // telephony pill
    box(0.6, 2.8, 5.9, 0.5, "Telephony adapter: Twilio now, Exotel / Plivo behind one interface", { fill: P.surfaceAlt, line: P.surfaceAlt, size: 12 });
    arrow(2.0, 2.4, 2.0, 2.8);
    arrow(5.05, 2.4, 5.05, 2.8);
    arrow(3.55, 3.3, 3.55, 3.62);
    // voice service
    s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 3.62, w: 7.8, h: 2.25, rectRadius: 0.16, fill: { color: P.ink }, line: { color: P.ink, width: 0 } });
    T(s, "Voice service  ·  Python 3.12, Pipecat 1.12, FastAPI", { x: 0.85, y: 3.7, w: 7.3, h: 0.35, fontFace: HEAD, bold: true, fontSize: 14, color: P.marigold });
    const chips = ["Silero VAD\nturn-taking", "Speech to\ntext", "Safety check\nevery turn", "LLM +\ntools", "Text to\nspeech"];
    chips.forEach((c, i) => {
      const x = 0.85 + i * 1.5;
      box(x, 4.15, 1.4, 0.85, c, { fill: P.inkSoft, line: P.inkLift, color: P.morning, size: 12 });
      if (i < 4) arrow(x + 1.4, 4.575, x + 1.5, 4.575, P.marigold);
    });
    T(s, "Care engine  ·  Escalator  ·  Post-call jobs  ·  Scheduler", { x: 0.85, y: 5.2, w: 7.3, h: 0.4, fontSize: 13, color: P.soft, align: "center" });
    // data
    s.addShape(pres.ShapeType.roundRect, { x: 8.8, y: 3.62, w: 3.9, h: 2.25, rectRadius: 0.16, fill: { color: P.tulsiBg }, line: { color: P.tulsiBg, width: 0 } });
    T(s, "Supabase", { x: 9.05, y: 3.72, w: 3.4, h: 0.35, fontFace: HEAD, bold: true, fontSize: 16, color: P.tulsiInk });
    T(s, "Postgres with row-level security, private storage for photo proofs, realtime. Clerk handles sign-in.", { x: 9.05, y: 4.15, w: 3.4, h: 1.5, fontSize: 14, color: P.ink });
    arrow(8.4, 4.75, 8.8, 4.75, P.tulsiInk);
    arrow(9.3, 2.4, 9.3, 3.62, P.slate);
    arrow(11.4, 2.4, 11.4, 3.62, P.slate);
    // bottom
    box(0.6, 6.1, 7.8, 0.7, "Groq: Qwen3.8 27B (chat + vision), gpt-oss-120b (summary, fallback), gpt-oss-20b (safety), Whisper", { fill: P.surface, size: 12 });
    arrow(4.5, 6.1, 4.5, 5.87, P.slate);
    box(8.8, 6.1, 3.9, 0.7, "Providers, languages, voices, models: all set in config", { fill: P.marigold, line: P.marigold, bold: true, size: 12, color: P.ink });
    s.addNotes("Read the diagram top to bottom. Callers reach the voice service either through the telephony adapter (Twilio today, Exotel and Plivo behind the same interface) or through WebRTC for the no-number demo. Inside: VAD, speech to text, a safety check on every turn, the LLM with tools, and text to speech. The pipeline is a cascade on purpose, so each piece can be swapped, including a speech-to-speech model later. State lives in Supabase with row-level security; the website and mobile app share one data API. Nothing is hard-coded: providers, languages, voices and models come from config.");
  }

  // ============================================================== 9. Tech stack
  {
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Technical" });
    kicker(s, "Tech stack");
    title(s, "Modern, open and swappable at every layer");
    const cards = [
      ["LuMic", "Voice and AI", ["Pipecat 1.12, Python 3.12, FastAPI", "Silero VAD, SmallWebRTC", "Groq Whisper for speech to text", "Qwen3.8 27B for chat and vision; gpt-oss for summary and safety"]],
      ["LuLayers", "Web", ["Next.js 16, React 19, Tailwind 4", "Landing page, family dashboard, live demo, admin", "One data API shared with mobile"]],
      ["LuSmartphone", "Mobile", ["Expo SDK 57 with Expo Router", "Reanimated and Skia for the orb", "Medicines, health, trends, messages, safety"]],
      ["LuDatabase", "Data and auth", ["Supabase Postgres, RLS on every table", "Private storage for photo proofs", "Clerk authentication"]],
      ["LuPhoneCall", "Telephony and speech", ["Twilio today; Exotel and Plivo via the same adapter", "Indic speech adapters: Bhashini, self-hosted IndicConformer", "Edge TTS for development only"]],
      ["LuSettings2", "Engineering", ["Turborepo and pnpm monorepo", "Config-driven providers, languages, models", "71 automated tests on the voice service"]],
    ];
    cards.forEach(([ik, h, items], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 0.6 + col * 4.1, y = 1.65 + row * 2.55;
      card(s, x, y, 3.9, 2.4, P.surface, "stack card");
      iconCircle(s, ik, x + 0.25, y + 0.22, 0.55);
      T(s, h, { x: x + 0.95, y: y + 0.22, w: 2.8, h: 0.55, fontFace: HEAD, bold: true, fontSize: 17, valign: "middle" });
      T(s, items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < items.length - 1, paraSpaceAfter: 3 } })), { x: x + 0.3, y: y + 0.92, w: 3.4, h: 1.42, fontSize: 12.5, color: P.slate });
    });
    s.addNotes("Do not read the list; pick three points. One: Pipecat gives us a real-time cascade with turn-taking tuned for elderly speakers. Two: the same data API serves the web and the mobile app. Three: everything provider-specific sits behind an interface and is chosen from config, so moving to Exotel or Plivo, or to Sarvam voices, is a configuration change plus an adapter.");
  }

  // ============================================================== 10. USP
  {
    pres.addSection({ title: "Close" });
    const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Close" });
    kicker(s, "What makes it different");
    title(s, "Zero effort for the parent, the full loop for the family");
    const cols = ["Heartline", "Reminder apps", "Wearables", "Human check-in calls", "Basic IVR"];
    const rows = [
      ["Parent installs nothing", ["y", "n", "n", "y", "y"]],
      ["Natural talk in her language", ["y", "n", "n", "y", "n"]],
      ["Understands what she says", ["y", "n", "n", "y", "n"]],
      ["Acts: doses, readings, notes", ["y", "p", "p", "p", "n"]],
      ["Escalates until a human answers", ["y", "p", "p", "p", "n"]],
      ["Daily summary for the family", ["y", "p", "p", "p", "n"]],
    ];
    const mark = (v, hero) =>
      v === "y" ? { text: "Yes", options: { color: hero ? P.tulsiInk : P.tulsi, bold: true, align: "center", fill: { color: hero ? P.tulsiBg : P.surface } } }
      : v === "p" ? { text: "Partly", options: { color: "8A5A00", align: "center", fill: { color: P.surface } } }
      : { text: "No", options: { color: P.sindoor, align: "center", fill: { color: P.surface } } };
    const head = [{ text: "", options: { fill: { color: P.morning } } }].concat(
      cols.map((c, i) => ({ text: c, options: { bold: true, align: "center", color: i === 0 ? P.ink : P.surface, fill: { color: i === 0 ? P.marigold : P.ink }, fontFace: HEAD, fontSize: 13 } })));
    const body = rows.map(([label, vals]) => [{ text: label, options: { bold: true, color: P.ink, fill: { color: P.surface } } }, ...vals.map((v, i) => mark(v, i === 0))]);
    s.addTable([head, ...body], {
      x: 0.6, y: 1.7, w: 12.1, colW: [3.5, 1.9, 1.7, 1.7, 1.8, 1.5], rowH: [0.62, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55],
      fontFace: BODY, fontSize: 14, valign: "middle", border: { type: "solid", pt: 0.75, color: P.border }, margin: [0, 0.12, 0, 0.12],
    });
    // three differentiators
    const d = [
      ["LuPhoneCall", "Zero install"],
      ["LuSiren", "Human in the loop"],
      ["LuLanguages", "10 languages, one agent"],
    ];
    d.forEach(([ik, t], i) => {
      const x = 0.6 + i * 4.1;
      card(s, x, 6.12, 3.9, 0.62, P.ink, "usp");
      iconCircle(s, ik, x + 0.12, 6.17, 0.52);
      T(s, t, { x: x + 0.85, y: 6.12, w: 2.95, h: 0.62, fontFace: HEAD, bold: true, fontSize: 15, color: P.morning, valign: "middle" });
    });
    s.addNotes("The comparison is of typical capabilities of each category, not of named products. The core claim: Heartline asks nothing of the parent yet still understands them, acts on what they say, and keeps escalating until a human answers. Three one-liners: zero install, human in the loop, ten languages from one agent.");
  }

  // ============================================================== 11. Conclusion
  {
    const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Close" });
    kicker(s, "In summary", true);
    T(s, "Peace of mind, in her own language.", { x: 0.6, y: 0.5, w: 12.1, h: 1.0, fontFace: HEAD, bold: true, fontSize: 38, color: P.morning, valign: "middle", objectName: "Title" });
    const st = [
      ["10", "Indian languages in the registry; Marathi, Hindi and English launch-ready"],
      ["3", "surfaces working together: the phone call, the website and the mobile app"],
      ["1–3 s", "typical reply time after the parent stops speaking"],
    ];
    st.forEach(([n, l], i) => {
      const x = 0.6 + i * 4.1;
      card(s, x, 1.9, 3.9, 2.35, P.inkSoft, "proof");
      T(s, n, { x: x + 0.3, y: 2.0, w: 3.3, h: 1.0, fontFace: HEAD, bold: true, fontSize: 48, color: P.marigold, valign: "middle" });
      T(s, l, { x: x + 0.3, y: 3.05, w: 3.3, h: 1.1, fontSize: 15, color: P.morning });
    });
    T(s, "WHAT'S NEXT", { x: 0.6, y: 4.55, w: 4, h: 0.3, fontSize: 12, bold: true, charSpacing: 3, color: P.marigold });
    const nx = ["Production numbers through Exotel or Plivo", "Sarvam Indic voices for all ten languages", "A pilot with the first families", "Testing the mobile app on real devices"];
    T(s, nx.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < nx.length - 1, paraSpaceAfter: 4 } })), { x: 0.6, y: 4.95, w: 7.4, h: 1.7, fontSize: 15, color: P.morning });
    s.addShape(pres.ShapeType.roundRect, { x: 8.55, y: 5.0, w: 4.15, h: 1.35, rectRadius: 0.2, fill: { color: P.marigold }, line: { color: P.marigold, width: 0 } });
    T(s, [{ text: "Try the live demo", options: { bold: true, fontSize: 20, breakLine: true } }, { text: "Talk to Sneha in your browser. No sign-up.", options: { fontSize: 13 } }], { x: 8.8, y: 5.0, w: 3.7, h: 1.35, color: P.ink, valign: "middle", fontFace: HEAD });
    s.addNotes("Land the message: peace of mind, in her own language. Recap what exists today: ten languages in the registry (three launch-ready), three working surfaces, and replies in one to three seconds. Close with the next steps and invite the judges to try the live demo.");
  }

  const out = path.join(__dirname, "heartline-pitch-deck.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})().catch((e) => { console.error(e); process.exit(1); });
