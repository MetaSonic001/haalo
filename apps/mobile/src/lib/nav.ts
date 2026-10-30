import { router } from "expo-router";

/** router.back() throws "GO_BACK was not handled" when there is no history (deep link, notification tap, first screen). */
export function goBack(fallback: "/(tabs)" | "/welcome" = "/(tabs)") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** Navigate to a route by path. Typed routes only know a screen after Expo's dev server has generated its types, so new screens go through here. */
export const go = (href: string) => router.push(href as never);
