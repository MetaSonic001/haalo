import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

const { POST } = await import("@/app/api/waitlist/route");
const file = path.resolve(process.cwd(), ".data/waitlist.jsonl");

const post = (body: unknown, ip = "1.1.1.1") =>
  POST(new Request("http://x/api/waitlist", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/waitlist (no database: dev file fallback)", () => {
  beforeAll(() => rm(file, { force: true }));
  afterAll(() => rm(file, { force: true }));

  it("accepts a valid signup and stores it", async () => {
    const res = await post({ email: "Family@Example.com", city: "Pune", parent_language: "mr" });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const line = JSON.parse((await readFile(file, "utf8")).trim().split("\n")[0]!);
    expect(line.email).toBe("family@example.com"); // normalised
  });

  it("rejects an invalid email with a helpful message", async () => {
    const res = await post({ email: "nope" }, "2.2.2.2");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/email/i);
  });

  it("rejects bots that fill the honeypot field", async () => {
    const res = await post({ email: "bot@example.com", website: "http://spam" }, "3.3.3.3");
    expect(res.status).toBe(400);
  });

  it("rate limits repeated attempts from one address", async () => {
    let last = 200;
    for (let i = 0; i < 8; i++) last = (await post({ email: `a${i}@example.com` }, "9.9.9.9")).status;
    expect(last).toBe(429);
  });
});
