/** Edge-safe copy of the demo switches (proxy.ts cannot import server-only modules). */
export const demoEnabled = process.env.DEMO_WORKSPACE === "true" && Boolean(process.env.DEMO_FAMILY_ID);
export const DEMO_COOKIE = "haalo_demo";
