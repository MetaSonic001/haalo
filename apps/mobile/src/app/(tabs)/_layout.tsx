import { Redirect, Tabs } from "expo-router";
import { Bell, Phone, Sun, Users } from "lucide-react-native";
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
    if (userId) void registerForPush(userId).catch(() => {});
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
      <Tabs.Screen name="calls" options={{ title: "Calls", tabBarIcon: ({ color }) => <Phone size={24} color={color} /> }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarBadge: openFlags > 0 ? openFlags : undefined,
          tabBarBadgeStyle: { backgroundColor: t.danger, color: "#fff" },
          tabBarIcon: ({ color }) => <Bell size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="family" options={{ title: "Family", tabBarIcon: ({ color }) => <Users size={24} color={color} /> }} />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { ready, session } = useSession();
  if (ready && !session && !config.demo) return <Redirect href="/welcome" />;
  return <TabsInner />;
}
