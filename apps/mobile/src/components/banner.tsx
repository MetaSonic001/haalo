import { router } from "expo-router";
import { BellRing } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { loadNotices, type Notice } from "@/lib/care";
import { config } from "@/lib/config";
import { useTheme } from "@/lib/theme";

/**
 * Demo build only: a banner that slides in when the family gets a new notification, standing in for the phone's push alert
 * (push needs a development build, not a browser). Real builds use Expo push; see lib/notifications.ts.
 */
export function NotificationBanner() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Notice | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!config.workspace) return;
    let alive = true;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const list = await loadNotices();
        if (!alive) return;
        if (seen.current === null) {
          seen.current = new Set(list.map((n) => n.id)); // what was already there is not news
          return;
        }
        const fresh = list.filter((n) => !seen.current!.has(n.id));
        fresh.forEach((n) => seen.current!.add(n.id));
        const pick = fresh.find((n) => n.kind === "flag") ?? fresh[0];
        if (pick) {
          setShown(pick);
          clearTimeout(hide);
          hide = setTimeout(() => setShown(null), 7000);
        }
      } catch {
        /* offline: try again next tick */
      }
    };
    void tick();
    const timer = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(hide);
    };
  }, []);

  if (!shown) return null;
  const urgent = shown.kind === "flag";
  return (
    <Animated.View entering={FadeInUp.duration(280)} exiting={FadeOutUp.duration(200)} style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, zIndex: 50 }} pointerEvents="box-none">
      <Pressable
        accessibilityRole="alert"
        onPress={() => {
          setShown(null);
          router.push(urgent ? "/(tabs)/alerts" : "/(tabs)");
        }}
        style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: urgent ? t.danger : "#1B2246", borderRadius: 18, padding: 14, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF22", alignItems: "center", justifyContent: "center" }}>
          <BellRing size={19} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <T size={12} color="#FFFFFFB3">Sneha · now</T>
          <T weight="semi" size={15} color="#fff" numberOfLines={2}>{shown.title}</T>
          {shown.body ? <T size={13} color="#FFFFFFD9" numberOfLines={2}>{shown.body}</T> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
