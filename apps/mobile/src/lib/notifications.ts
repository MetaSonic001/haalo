import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { config } from "./config";
import { registerPushToken } from "./data";

type NotificationsModule = typeof import("expo-notifications");

/**
 * expo-notifications THROWS AT IMPORT on Android inside Expo Go (SDK 53+ removed remote push there). Importing it at the top
 * of a file would crash the whole app before the router mounts, so it is required lazily and only where it can work:
 * development builds / production builds on Android, and iOS. In Expo Go on Android push is simply unavailable.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const pushSupported = !(isExpoGo && Platform.OS === "android");

let cached: NotificationsModule | null | undefined;
function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (!pushSupported) return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-notifications") as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

/** Ask permission, create the Android channels, and register this device's Expo push token. Never throws. */
export async function registerForPush(userId: string): Promise<string | null> {
  const N = notifications();
  if (!N || config.demo || !Device.isDevice) return null;
  try {
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("default", { name: "Daily summaries", importance: N.AndroidImportance.DEFAULT });
      await N.setNotificationChannelAsync("alerts", {
        name: "Alerts",
        importance: N.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: "#C8352C",
      });
    }
    const existing = await N.getPermissionsAsync();
    const final = existing.status === "granted" ? existing : await N.requestPermissionsAsync();
    if (final.status !== "granted") return null;
    const projectId = config.easProjectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null; // push needs an EAS project id (EXPO_PUBLIC_EAS_PROJECT_ID)
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    await registerPushToken(userId, data, Platform.OS);
    return data;
  } catch {
    return null; // push is a nicety; the app works without it
  }
}

/** Notification taps deep-link to the call detail or the alerts tab (the voice service puts `url` in the push data). */
export function useNotificationRouting() {
  useEffect(() => {
    const N = notifications();
    if (!N) return;
    const go = (url: unknown) => typeof url === "string" && router.push(url as never);
    N.getLastNotificationResponseAsync()
      .then((r) => r && go(r.notification.request.content.data?.url))
      .catch(() => {});
    const sub = N.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data?.url));
    return () => sub.remove();
  }, []);
}
