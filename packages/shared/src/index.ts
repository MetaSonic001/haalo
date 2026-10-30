export * from "./languages";
export * from "./schemas";
export * from "./i18n";

export const PRODUCT = {
  name: "Heartline",
  tagline: "A daily call for the people who raised you.",
  taglineLocal: "Roz ka haal-chaal, unki bhasha mein.",
  demoMaxSeconds: 180,
} as const;

/** Plan copy comes from config, not code. "Free pilot" until pricing is decided. */
export const PRICING_PLACEHOLDER = {
  name: "Free pilot",
  blurb: "Heartline is free while we learn with the first families. Pricing will be announced before the pilot ends.",
} as const;
