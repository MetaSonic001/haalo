import { AnekDevanagari_400Regular, AnekDevanagari_600SemiBold, AnekDevanagari_700Bold } from "@expo-google-fonts/anek-devanagari";
import { AnekLatin_400Regular, AnekLatin_600SemiBold, AnekLatin_700Bold, useFonts } from "@expo-google-fonts/anek-latin";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FamilyProvider } from "@/lib/family";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { useNotificationRouting } from "@/lib/notifications";
import { NotificationBanner } from "@/components/banner";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { t, scheme } = useTheme();
  const { ready } = useSession();
  useNotificationRouting();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <NotificationBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: "slide_from_right" }}>
        <Stack.Screen name="settings" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="add-parent" options={{ presentation: "modal", animation: "slide_from_bottom", gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function Root() {
  const [loaded] = useFonts({
    AnekLatin_400Regular, AnekLatin_600SemiBold, AnekLatin_700Bold,
    AnekDevanagari_400Regular, AnekDevanagari_600SemiBold, AnekDevanagari_700Bold,
  });
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SessionProvider>
            {/* Above the Stack so tab screens AND modal routes (settings, add-parent) can all use useFamily() */}
            <FamilyProvider>
              <Shell />
            </FamilyProvider>
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
