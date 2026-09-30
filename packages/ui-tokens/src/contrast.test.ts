import { describe, expect, it } from "vitest";
import { contrast, themes, type ThemeName } from "./index";

/** Every text/background pair that ships must pass WCAG AA (4.5:1 body text). */
const pairs: Array<[keyof (typeof themes)["light"], keyof (typeof themes)["light"]]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surfaceAlt"],
  ["textMuted", "bg"],
  ["textMuted", "surface"],
  ["onAccent", "accent"],
  ["good", "goodBg"],
  ["good", "surface"],
  ["danger", "dangerBg"],
  ["danger", "surface"],
  ["warn", "warnBg"],
  ["warn", "surface"],
];

describe.each(["light", "dark"] as ThemeName[])("%s theme contrast (WCAG AA)", (name) => {
  for (const [fg, bg] of pairs) {
    it(`${fg} on ${bg} >= 4.5`, () => {
      const t = themes[name];
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
