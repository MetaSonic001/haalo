/**
 * Heartline design tokens. Single source for web (CSS variables) and mobile (RN theme).
 * Direction: "Morning call, Indian home". Calm morning light, indigo block-print ink, marigold diya glow.
 */

export const palette = {
  ink: "#1B2246",
  inkSoft: "#252D57",
  morning: "#EEF2F8",
  surface: "#FFFFFF",
  marigold: "#F3A712",
  marigoldDeep: "#C98500",
  tulsi: "#3C8A5A",
  tulsiInk: "#2B6B44",
  sindoor: "#C8352C",
  mist: "#8A93AD",
  slate: "#525C7E",
} as const;

export type ThemeName = "light" | "dark";

export interface Theme {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  onAccent: string;
  good: string;
  goodBg: string;
  danger: string;
  dangerBg: string;
  warn: string;
  warnBg: string;
  focus: string;
}

export const themes: Record<ThemeName, Theme> = {
  light: {
    bg: palette.morning,
    surface: palette.surface,
    surfaceAlt: "#E3E9F4",
    text: palette.ink,
    textMuted: palette.slate,
    border: "#D5DCEA",
    accent: palette.marigold,
    onAccent: palette.ink,
    good: palette.tulsiInk,
    goodBg: "#DDF0E4",
    danger: palette.sindoor,
    dangerBg: "#FDEEEC",
    warn: "#8A5A00",
    warnBg: "#FCEFCB",
    focus: palette.ink,
  },
  dark: {
    bg: palette.ink,
    surface: palette.inkSoft,
    surfaceAlt: "#2F386A",
    text: palette.morning,
    textMuted: "#AEB6D0",
    border: "#39437A",
    accent: palette.marigold,
    onAccent: palette.ink,
    good: "#7CCF9C",
    goodBg: "#1F4A36",
    danger: "#FF9B93",
    dangerBg: "#5A2431",
    warn: "#F6C453",
    warnBg: "#4A3B17",
    focus: palette.marigold,
  },
};

/** Type scale, 1.25 ratio. 16 is body. */
export const fontSize = { xs: 12, sm: 14, base: 16, lg: 20, xl: 25, "2xl": 31, "3xl": 39, "4xl": 49 } as const;

export const fontFamily = {
  sans: "Anek",
  /** Google Fonts family names per script; only the scripts in the language registry are loaded. */
  scripts: {
    Latin: "Anek Latin",
    Devanagari: "Anek Devanagari",
    Gujarati: "Anek Gujarati",
    Tamil: "Anek Tamil",
    Telugu: "Anek Telugu",
    Kannada: "Anek Kannada",
    Bengali: "Anek Bangla",
    Malayalam: "Anek Malayalam",
    Gurmukhi: "Anek Gurmukhi",
  },
} as const;

/** Hierarchy shows in radius: big status card, medium rows, pill chips. */
export const radius = { card: 24, row: 14, chip: 999, sheet: 28, input: 12 } as const;

export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80 } as const;

export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  easeOut: [0.16, 1, 0.3, 1] as const,
  spring: { stiffness: 380, damping: 30, mass: 1 },
  orb: { ringDuration: 2400, breatheDuration: 5200, rings: 3 },
} as const;

/** Mood is always shown as colour AND words, never colour alone. */
export const moodTone = {
  good: { label: "Cheerful", tone: "good" },
  okay: { label: "Okay", tone: "warn" },
  low: { label: "A bit low", tone: "danger" },
  unclear: { label: "Hard to tell", tone: "muted" },
} as const;

export const severityTone = {
  low: { label: "Low", tone: "warn" },
  medium: { label: "Medium", tone: "warn" },
  high: { label: "High", tone: "danger" },
  emergency: { label: "Emergency", tone: "danger" },
} as const;

export function cssVariables(name: ThemeName): string {
  const t = themes[name];
  const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  return Object.entries(t)
    .map(([k, v]) => `  --${kebab(k)}: ${v};`)
    .join("\n");
}

// ---- WCAG helpers (used by the contrast test and available to UI code)
function lin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
