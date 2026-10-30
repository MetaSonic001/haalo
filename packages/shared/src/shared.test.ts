import { describe, expect, it } from "vitest";
import { e164, fontFamiliesToLoad, getLanguage, languages, launchLanguages, newParent, t, waitlistInput } from "./index";

describe("language registry", () => {
  it("has the three launch languages", () => {
    expect(launchLanguages.map((l) => l.code).sort()).toEqual(["en", "hi", "mr"]);
  });
  it("loads Devanagari + Latin fonts by script", () => {
    expect(fontFamiliesToLoad(["mr", "en"])).toEqual(["Anek Latin", "Anek Devanagari"]);
  });
  it("every language has a native name and consent string", () => {
    for (const l of languages) {
      expect(l.native_name.length).toBeGreaterThan(0);
      expect(l.strings.consent).toContain("{honorific}");
    }
    expect(getLanguage("mr").native_name).toBe("मराठी");
  });
});

describe("schemas", () => {
  it("validates E.164 and explains the fix", () => {
    expect(e164.safeParse("+919876543210").success).toBe(true);
    const bad = e164.safeParse("9876543210");
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toContain("country code");
  });
  it("accepts a full new-parent payload", () => {
    const r = newParent.safeParse({
      name: "Shobha", honorific: "Aai", phone_e164: "+919876543210", language: "mr",
      window_start: "09:00", window_end: "10:30", days_of_week: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(r.success).toBe(true);
  });
  it("rejects filled honeypot", () => {
    expect(waitlistInput.safeParse({ email: "a@b.co", website: "spam" }).success).toBe(false);
  });
});

describe("i18n", () => {
  it("interpolates and falls back to English", () => {
    expect(t("en", "empty_today", { name: "Aai", time: "9:00" })).toBe("Sneha will call Aai at 9:00 tomorrow. You'll get a summary here.");
    expect(t("hi", "empty_today", { name: "Mummy", time: "9:00" })).toContain("Mummy");
  });
});
