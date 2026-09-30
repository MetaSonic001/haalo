import registry from "../languages.json";

export type LanguageStatus = "launch" | "preview" | "planned";

export interface LanguageEntry {
  code: string;
  status: LanguageStatus;
  review: string;
  name: string;
  native_name: string;
  script: string;
  font_family: string;
  stt: { whisper: string; sarvam: string; bhashini: string };
  tts: { edge_voices: { female?: string; male?: string }; sarvam_lang: string; bhashini: string };
  honorifics: string[];
  default_honorific: string;
  /** Honorific written in the language's own script, for spoken lines. */
  honorifics_native: Record<string, string>;
  strings: Record<
    "consent" | "greeting" | "no_response" | "closing" | "emergency" | "scam_warning" | "declined_close",
    string
  >;
  emergency_phrases: Record<string, string[]>;
  note?: string;
}

export const languages = registry.languages as unknown as LanguageEntry[];
export const emergencyNumbers = registry.emergency_numbers;

export const launchLanguages = languages.filter((l) => l.status === "launch");
/** Languages families can pick today (launch + preview). Planned ones need a TTS provider first. */
export const selectableLanguages = languages.filter((l) => l.status !== "planned");

export function getLanguage(code: string): LanguageEntry {
  const l = languages.find((x) => x.code === code);
  if (!l) throw new Error(`Unknown language "${code}"`);
  return l;
}

/** Google Fonts families to load: only scripts present in the registry (Latin always). */
export function fontFamiliesToLoad(codes: string[] = languages.map((l) => l.code)): string[] {
  const set = new Set<string>(["Anek Latin"]);
  for (const c of codes) set.add(getLanguage(c).font_family);
  return [...set];
}

export function greetingPreview(code: string, honorific?: string, child = "Riya"): string {
  const l = getLanguage(code);
  return l.strings.greeting.replace("{honorific}", honorific || l.default_honorific).replace("{child}", child);
}
