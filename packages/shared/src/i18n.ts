/**
 * App UI strings (family app + web). Copy voice: plain, warm, specific. Buttons say exactly what happens.
 * English is complete; Hindi and Marathi cover the core flow. Missing keys fall back to English.
 * Placeholders use {name}. All non-English strings need native review before launch.
 */
export type AppLocale = "en" | "hi" | "mr";

const en = {
  tagline: "A daily call for the people who raised you.",
  tagline_local: "Roz ka haal-chaal, unki bhasha mein.",
  get_started: "Get started",
  have_invite: "I have an invite",
  tab_today: "Today",
  tab_calls: "Calls",
  tab_alerts: "Alerts",
  tab_family: "Family",
  empty_today: "Haalo will call {name} at {time} tomorrow. You'll get a summary here.",
  status_cheerful: "{name} sounded cheerful today",
  status_okay: "{name} sounded okay today",
  status_low: "{name} sounded a bit low today",
  status_unclear: "Hard to tell how {name} was today",
  call_now: "Call {name} now",
  call_now_toast: "Haalo is calling {name} now.",
  schedule_first: "Schedule first call",
  first_call_scheduled: "First call scheduled for {time} tomorrow.",
  first_call_explainer: "The first call introduces Haalo as an AI assistant and asks {name} for permission. If they say no, calls stop and you'll be told.",
  ack: "Acknowledge",
  resolve: "Mark resolved",
  call_parent_now: "Call {name} now",
  err_phone: "We couldn't reach {name}'s number. Check it has the country code, e.g. +91.",
  meds_taken: "Took {med}",
  meds_missed: "Hasn't taken {med} yet",
  consent_pending: "Waiting for {name}'s permission on the first call",
  consent_granted: "{name} agreed to the daily calls",
  consent_declined: "{name} declined the calls",
} as const;

export type MessageKey = keyof typeof en;

const hi: Partial<Record<MessageKey, string>> = {
  tagline: "उनके लिए रोज़ एक फ़ोन, जिन्होंने आपको पाला।",
  tagline_local: "रोज़ का हाल-चाल, उनकी भाषा में।",
  get_started: "शुरू करें",
  have_invite: "मेरे पास निमंत्रण है",
  tab_today: "आज",
  tab_calls: "कॉल",
  tab_alerts: "अलर्ट",
  tab_family: "परिवार",
  call_now: "{name} को अभी फ़ोन करें",
  schedule_first: "पहला कॉल तय करें",
  ack: "देख लिया",
  resolve: "हल हो गया",
};

const mr: Partial<Record<MessageKey, string>> = {
  tagline: "ज्यांनी तुम्हाला वाढवलं, त्यांच्यासाठी रोजचा एक फोन.",
  tagline_local: "रोजचं हालचाल, त्यांच्या भाषेत.",
  get_started: "सुरू करा",
  have_invite: "माझ्याकडे आमंत्रण आहे",
  tab_today: "आज",
  tab_calls: "कॉल",
  tab_alerts: "अलर्ट",
  tab_family: "कुटुंब",
  call_now: "{name} यांना आत्ता फोन करा",
  schedule_first: "पहिला कॉल ठरवा",
  ack: "पाहिलं",
  resolve: "सोडवलं",
};

const catalogs: Record<AppLocale, Partial<Record<MessageKey, string>>> = { en, hi, mr };

export function t(locale: AppLocale, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const raw = catalogs[locale][key] ?? en[key];
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export const appLocales: Array<{ code: AppLocale; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
];
