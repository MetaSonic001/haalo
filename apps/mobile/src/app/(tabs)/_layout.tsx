import { Redirect, Tabs } from "expo-router";
import { Activity, Bell, LayoutGrid, Pill, Sun } from "lucide-react-native";
import { useEffect } from "react";
import { useFamily } from "@/lib/family";
import { registerForPush } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { config } from "@/lib/config";

function TabsInner() {
  const { t, fs } = useTheme();
  const { openFlags } = useFamily();
  const { userId } = useSession();
  useEffect(() => {
    if (userId && !config.workspace) void registerForPush(userId).catch(() => {});
  }, [userId]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
        tabBarLabelStyle: { fontFamily: "AnekLatin_600SemiBold", fontSize: fs(12) },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: ({ color }) => <Sun size={24} color={color} /> }} />
      <Tabs.Screen name="medicines" options={{ title: "Medicines", tabBarIcon: ({ color }) => <Pill size={24} color={color} /> }} />
      <Tabs.Screen name="health" options={{ title: "Health", tabBarIcon: ({ color }) => <Activity size={24} color={color} /> }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarBadge: openFlags > 0 ? openFlags : undefined,
          tabBarBadgeStyle: { backgroundColor: t.danger, color: "#fff" },
          tabBarIcon: ({ color }) => <Bell size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color }) => <LayoutGrid size={24} color={color} /> }} />
      {/* Reached from More; kept as tab routes so they keep the tab bar */}
      <Tabs.Screen name="calls" options={{ href: null }} />
      <Tabs.Screen name="family" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { ready, session } = useSession();
  if (ready && !session && !config.demo) return <Redirect href="/welcome" />;
  return <TabsInner />;
}
