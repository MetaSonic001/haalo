import path from "node:path";
import dotenv from "dotenv";
import type { ExpoConfig } from "expo/config";

// One .env at the repo root drives everything.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const env = process.env;

const config: ExpoConfig = {
  name: "Haalo",
  slug: "haalo",
  scheme: "haalo",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: "app.haalo.family", supportsTablet: true },
  android: {
    package: "app.haalo.family",
    adaptiveIcon: {
      backgroundImage: "./assets/images/android-icon-background.png",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
  },
  web: { output: "single", favicon: "./assets/images/favicon.png" },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: "#1B2246", image: "./assets/images/splash-icon.png", imageWidth: 200 }],
    ["expo-notifications", { color: "#F3A712" }],
    "expo-font",
    "expo-secure-store",
    "@clerk/expo",
  ],
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseKey:
      env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    voiceUrl: env.EXPO_PUBLIC_VOICE_URL ?? env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860",
    posthogKey: env.EXPO_PUBLIC_POSTHOG_KEY ?? "",
    clerkKey: env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
    eas: { projectId: env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "" },
  },
};

export default config;
