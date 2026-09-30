import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, Text, View, type PressableProps, type TextProps, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { moodTone } from "@haalo/ui-tokens";
import { useTheme } from "@/lib/theme";

const hasDeva = (s: unknown) => typeof s === "string" && /[ऀ-ॿ]/.test(s);
const flat = (c: React.ReactNode): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map(flat).join("") : "");

type Weight = "regular" | "semi" | "bold";
const family = (deva: boolean, w: Weight) => {
  const f = deva ? "AnekDevanagari" : "AnekLatin";
  return w === "bold" ? `${f}_700Bold` : w === "semi" ? `${f}_600SemiBold` : `${f}_400Regular`;
};

/** Text in Anek: picks the Devanagari design automatically for Marathi/Hindi strings; scales with large-text mode. */
export function T({
  size = 16, weight = "regular", muted, color, style, children, ...rest
}: TextProps & { size?: number; weight?: Weight; muted?: boolean; color?: string }) {
  const { t, fs } = useTheme();
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={1.6}
      style={[{ fontFamily: family(hasDeva(flat(children)), weight), fontSize: fs(size), lineHeight: fs(size) * 1.45, color: color ?? (muted ? t.textMuted : t.text) }, style]}
    >
      {children}
    </Text>
  );
}

export const Display = ({ size = 31, ...p }: TextProps & { size?: number; color?: string }) => (
  <T {...p} size={size} weight="bold" style={[{ lineHeight: size * 1.15, letterSpacing: -0.3 }, p.style]} />
);

export function Screen({ children, scroll = true, ...rest }: ViewProps & { scroll?: boolean }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 };
  return scroll ? (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={pad} contentInsetAdjustmentBehavior="automatic" {...rest}>
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, backgroundColor: t.bg }, pad]} {...rest}>
      {children}
    </View>
  );
}

export function Card({ style, ...p }: ViewProps) {
  const { t, radius } = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: radius.card, padding: 20 }, style]} {...p} />;
}

export function Row({ style, ...p }: ViewProps) {
  const { t, radius } = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: radius.row, paddingHorizontal: 16, paddingVertical: 12 }, style]} {...p} />;
}

type ChipTone = "neutral" | "good" | "warn" | "danger" | "accent";
export function Chip({ tone = "neutral", children, icon }: { tone?: ChipTone; children: string; icon?: boolean }) {
  const { t } = useTheme();
  const map = {
    neutral: [t.surfaceAlt, t.text], good: [t.goodBg, t.good], warn: [t.warnBg, t.warn], danger: [t.dangerBg, t.danger], accent: [t.accent, t.onAccent],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
      {icon ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fg }} /> : null}
      <T size={14} weight="semi" color={fg}>
        {children}
      </T>
    </View>
  );
}

/** Mood: colour AND words, never colour alone. */
export function MoodBadge({ mood }: { mood?: string | null }) {
  const m = moodTone[(mood as keyof typeof moodTone) ?? "unclear"] ?? moodTone.unclear;
  const tone = ({ good: "good", warn: "warn", danger: "danger", muted: "neutral" } as const)[m.tone];
  return (
    <Chip tone={tone} icon>
      {m.label}
    </Chip>
  );
}

export function Button({
  title, onPress, variant = "primary", icon: Icon, disabled, haptic = "light", ...rest
}: Omit<PressableProps, "children"> & { title: string; variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: LucideIcon; haptic?: "light" | "success" | "warning" | "none" }) {
  const { t } = useTheme();
  const scheme = {
    primary: { bg: t.accent, fg: t.onAccent, border: "transparent" },
    secondary: { bg: t.surface, fg: t.text, border: t.border },
    ghost: { bg: "transparent", fg: t.text, border: "transparent" },
    danger: { bg: t.danger, fg: "#FFFFFF", border: "transparent" },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={(e) => {
        if (haptic === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (haptic === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (haptic === "warning") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => ({
        minHeight: 52, borderRadius: 999, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
        backgroundColor: scheme.bg, borderWidth: 1, borderColor: scheme.border, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
      {...rest}
    >
      {Icon ? <Icon size={20} color={scheme.fg} /> : null}
      <T weight="semi" size={17} color={scheme.fg}>
        {title}
      </T>
    </Pressable>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <T muted>{children}</T>
    </Card>
  );
}
