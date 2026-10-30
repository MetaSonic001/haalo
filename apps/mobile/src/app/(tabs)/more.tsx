import { CalendarDays, ChevronRight, LineChart, MessageCircleHeart, Phone, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Display, Row, Screen, T } from "@/components/ui";
import { ParentPills } from "@/components/care";
import { go } from "@/lib/nav";
import { useTheme } from "@/lib/theme";

const items: Array<{ href: string; label: string; hint: string; icon: LucideIcon }> = [
  { href: "/safety", label: "Safety", hint: "The alert ladder and emergency contacts", icon: ShieldCheck },
  { href: "/messages", label: "Messages", hint: "Say something to them through Sneha", icon: MessageCircleHeart },
  { href: "/trends", label: "Trends", hint: "What changed over the weeks", icon: LineChart },
  { href: "/calendar", label: "Calendar", hint: "Appointments, festivals, birthdays", icon: CalendarDays },
  { href: "/(tabs)/calls", label: "Calls", hint: "Every conversation, with transcripts", icon: Phone },
  { href: "/(tabs)/family", label: "Family", hint: "Who is in the circle", icon: Users },
  { href: "/settings", label: "Settings", hint: "Schedule, privacy, large text", icon: Settings },
];

export default function More() {
  const { t } = useTheme();
  return (
    <Screen>
      <ParentPills />
      <Display>More</Display>
      <T muted style={{ marginBottom: 16 }}>Everything else Heartline does for your family.</T>
      <View style={{ gap: 10 }}>
        {items.map(({ href, label, hint, icon: Icon }) => (
          <Pressable key={label} accessibilityRole="button" onPress={() => go(href)}>
            <Row style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
                <Icon size={21} color={t.text} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="semi" size={17}>{label}</T>
                <T size={13} muted>{hint}</T>
              </View>
              <ChevronRight size={20} color={t.textMuted} />
            </Row>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
