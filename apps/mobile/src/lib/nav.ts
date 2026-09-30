import { router } from "expo-router";

/** router.back() throws "GO_BACK was not handled" when there is no history (deep link, notification tap, first screen). */
export function goBack(fallback: "/(tabs)" | "/welcome" = "/(tabs)") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
