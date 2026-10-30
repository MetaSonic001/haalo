// Cuts the raw recordings into a pitch video (with sound) and writes the matching voice-over script.
//
//   node tools/demo-video/assemble.mjs pitch      # plans/pitch.json  -> demo/haalo-pitch.mp4 + demo/VOICEOVER-pitch.md
//   node tools/demo-video/assemble.mjs full       # plans/full.json   -> demo/haalo-full-tour.mp4 + demo/VOICEOVER-full.md
//
// A plan is { sources: { name: { file, offset, timeline } }, segments: [{ src, from, to, speed, label, vo }] }.
// `from`/`to` are in the recorder's scene-mark seconds (timeline.json / record.log); `offset` converts them to video seconds
// (the recorder's clock starts a moment before the first video frame). `timeline` is the recorder's JSON, which lists the call
// audio it captured (Sneha's voice and the parents' lines) and when each sound happened. `vo` is what the voice-over says.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const DEMO = path.join(root, "demo");
const name = process.argv[2] ?? "pitch";
const plan = JSON.parse(fs.readFileSync(path.join(here, "plans", `${name}.json`), "utf8"));
const WPM = 150; // a calm speaking pace
const HAALO_GAIN = Number(process.env.HAALO_GAIN ?? 1.0);
const PARENT_GAIN = Number(process.env.PARENT_GAIN ?? 0.8);

const probe = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

/** One audio file per source recording, laid out on the video's own clock: silence with every captured call sound placed where it happened. */
function mixSourceAudio(srcName, src) {
  const video = path.join(DEMO, src.file);
  const dur = probe(video);
  const out = path.join(DEMO, ".raw", `${srcName}.mix.wav`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (src.audioFromFile) {
    // an already-finished video (e.g. the earlier pitch): its own soundtrack is the audio
    run(["-i", video, "-vn", "-ar", "48000", "-ac", "2", out]);
    console.log(`audio for ${srcName}: taken from the video itself`);
    return out;
  }
  const tl = src.timeline && fs.existsSync(path.join(DEMO, src.timeline)) ? JSON.parse(fs.readFileSync(path.join(DEMO, src.timeline), "utf8")) : null;
  const clips = (tl?.audio ?? []).filter((c) => fs.existsSync(path.join(DEMO, c.kind === "haalo" ? path.join("audio", c.file) : c.file)));
  const inputs = ["-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=48000:cl=stereo"];
  const filters = [];
  clips.forEach((c, i) => {
    const file = path.join(DEMO, c.kind === "haalo" ? path.join("audio", c.file) : c.file);
    inputs.push("-i", file);
    const delay = Math.max(0, ((c.epoch - tl.t0Epoch) / 1000 - (src.offset ?? 0)) * 1000);
    const gain = c.kind === "haalo" ? HAALO_GAIN : PARENT_GAIN;
    filters.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${gain},adelay=${Math.round(delay)}|${Math.round(delay)}[a${i}]`);
  });
  const mixIn = ["[0:a]", ...clips.map((_, i) => `[a${i}]`)].join("");
  filters.push(`${mixIn}amix=inputs=${clips.length + 1}:normalize=0:duration=first[m]`);
  run([...inputs, "-filter_complex", filters.join(";"), "-map", "[m]", "-t", dur.toFixed(2), out]);
  console.log(`audio for ${srcName}: ${clips.length} clip(s)`);
  return out;
}

const srcNames = Object.keys(plan.sources);
const mixes = srcNames.map((n) => mixSourceAudio(n, plan.sources[n]));
const inputs = srcNames.flatMap((n, i) => ["-i", path.join(DEMO, plan.sources[n].file), "-i", mixes[i]]);
const atempo = (s) => {
  const chain = [];
  let x = s;
  while (x > 2) {
    chain.push("atempo=2.0");
    x /= 2;
  }
  while (x < 0.5) {
    chain.push("atempo=0.5");
    x *= 2;
  }
  chain.push(`atempo=${x.toFixed(4)}`);
  return chain.join(",");
};

const parts = [];
const rows = [];
let outT = 0;
plan.segments.forEach((s, i) => {
  const off = plan.sources[s.src].offset ?? 0;
  const a = Math.max(0, s.from - off);
  const b = s.to - off;
  const speed = s.speed ?? 1;
  const idx = srcNames.indexOf(s.src);
  const dur0 = (b - a) / speed;
  // optional camera move: ease into a spot (zoom = [scale, x, y] with x, y as 0..1 of the frame), hold, and ease back out
  let cam = "";
  if (s.zoom) {
    const [zs, cx, cy] = s.zoom; // scale, and the point of interest as 0..1 of the frame
    const fx = Math.min(1, Math.max(0, (cx * zs - 0.5) / (zs - 1)));
    const fy = Math.min(1, Math.max(0, (cy * zs - 0.5) / (zs - 1)));
    const D = dur0.toFixed(2);
    // zoompan works on a 2x upscaled picture so the move stays smooth; z eases in over 1.5 s, holds, and eases out over 1.2 s
    const z = `1+(${zs}-1)*min(1,min(on/30/1.5,(${D}-on/30)/1.2))`;
    cam = `,scale=3840:2160,zoompan=z='${z}':x='(iw-iw/zoom)*${fx.toFixed(3)}':y='(ih-ih/zoom)*${fy.toFixed(3)}':d=1:s=1920x1080:fps=30`;
  }
  parts.push(`[${idx * 2}:v]trim=start=${a.toFixed(2)}:end=${b.toFixed(2)},setpts=(PTS-STARTPTS)/${speed},fps=30${cam},format=yuv420p[v${i}]`);
  parts.push(`[${idx * 2 + 1}:a]atrim=start=${a.toFixed(2)}:end=${b.toFixed(2)},asetpts=PTS-STARTPTS,${atempo(speed)}[a${i}]`);
  const dur = (b - a) / speed;
  rows.push({ ...s, start: outT, dur });
  outT += dur;
});
const concat = `${plan.segments.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${plan.segments.length}:v=1:a=1[vc][ac]`;
const fade = `[vc]fade=t=in:st=0:d=0.6,fade=t=out:st=${(outT - 0.8).toFixed(2)}:d=0.8[v];[ac]afade=t=in:st=0:d=0.4,afade=t=out:st=${(outT - 0.8).toFixed(2)}:d=0.8[a]`;
const outFile = path.join(DEMO, plan.output);
run([...inputs, "-filter_complex", [...parts, concat, fade].join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", outFile]);

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
let md = `# ${plan.title}\n\nTotal length ${mmss(outT)} (${outT.toFixed(0)} s). Read each line while the matching part of the video plays. The pace assumes about ${WPM} words a minute; a line marked **TOO LONG** needs trimming or the clip needs slowing down.\n\n`;
md += "| Time | On screen | Say |\n| --- | --- | --- |\n";
for (const r of rows) {
  const words = (r.vo ?? "").trim().split(/\s+/).filter(Boolean).length;
  const need = (words / WPM) * 60;
  const flag = words && need > r.dur + 0.5 ? ` **TOO LONG** (${need.toFixed(0)} s of speech for ${r.dur.toFixed(0)} s)` : "";
  md += `| ${mmss(r.start)} to ${mmss(r.start + r.dur)} | ${r.label} | ${(r.vo ?? "").replace(/\|/g, "/").replace(/\n/g, " ") || "_(let the video play)_"}${flag} |\n`;
}
md += `\n---\n\n## Same script, as plain text\n\n` + rows.filter((r) => r.vo).map((r) => `**${mmss(r.start)}** ${r.vo}`).join("\n\n") + "\n";
fs.writeFileSync(path.join(DEMO, plan.voiceover), md, "utf8");
console.log(`wrote ${outFile} (${outT.toFixed(1)} s) and ${plan.voiceover}`);
