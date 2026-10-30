import { Check, Circle, Clock, PhoneCall, TriangleAlert } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Circle as SvgCircle, G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import type { DoseEvent, Vital } from "@haalo/db";
import { Chip, T } from "@/components/ui";
import { useFamily } from "@/lib/family";
import { fmtTime } from "@/lib/format";
import { useTheme } from "@/lib/theme";

/** "Aai · Appa · Dadi ji": the parent switcher shown at the top of every care screen. */
export function ParentPills() {
  const { t } = useTheme();
  const { family, parent, setParentId } = useFamily();
  const parents = family?.parents ?? [];
  if (parents.length < 2) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
      {parents.map((p) => {
        const on = p.id === parent?.id;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => setParentId(p.id)}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? t.text : t.border, backgroundColor: on ? t.text : t.surface }}
          >
            <T weight="semi" size={15} color={on ? t.bg : t.text}>
              {p.honorific || p.name}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <T weight="semi" size={20} style={{ marginTop: 8 }}>
      {children}
    </T>
  );
}

function Tick({ done }: { done: boolean }) {
  const { t } = useTheme();
  const s = useSharedValue(done ? 0.4 : 1);
  useEffect(() => {
    if (done) s.value = withSpring(1, { stiffness: 500, damping: 14 });
  }, [done, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.good, alignItems: "center", justifyContent: "center" }, style]}>
      <Check size={18} color={t.bg} strokeWidth={3} />
    </Animated.View>
  );
}

const via: Record<string, string> = {
  call: "on the daily call", reminder_call: "on a reminder call", inbound: "when they called Sneha", photo: "with a photo", family: "confirmed by family", manual: "confirmed by family",
};

export function DoseRow({ d, onTaken }: { d: DoseEvent; onTaken?: (d: DoseEvent) => void }) {
  const { t } = useTheme();
  const overdue = (d.status === "pending" || d.status === "reminded") && new Date(d.due_at).getTime() < Date.now() - 30 * 60_000;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
      {d.status === "taken" ? (
        <Tick done />
      ) : d.status === "missed" ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.dangerBg, alignItems: "center", justifyContent: "center" }}>
          <TriangleAlert size={18} color={t.danger} />
        </View>
      ) : d.status === "reminded" ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.warnBg, alignItems: "center", justifyContent: "center" }}>
          <PhoneCall size={17} color={t.warn} />
        </View>
      ) : overdue ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.warnBg, alignItems: "center", justifyContent: "center" }}>
          <Clock size={17} color={t.warn} />
        </View>
      ) : (
        <Circle size={32} color={t.textMuted} strokeWidth={1.5} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="semi" numberOfLines={1}>{d.medicines?.name ?? "Medicine"}</T>
        <T size={13} muted numberOfLines={2}>
          {[d.medicines?.dose_text, fmtTime(d.due_at)].filter(Boolean).join(" · ")}
          {d.status === "taken" && d.confirmed_via ? ` · taken ${via[d.confirmed_via] ?? ""}` : ""}
          {d.status === "reminded" ? " · reminded, waiting to hear" : ""}
          {d.status === "missed" ? " · missed" : ""}
        </T>
      </View>
      {onTaken && d.status !== "taken" ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${d.medicines?.name ?? "dose"} taken`} onPress={() => onTaken(d)} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: t.surface }}>
          <T size={13} weight="semi">Mark taken</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Seven columns, one per day: green = confirmed, red = missed. */
export function WeekBars({ days }: { days: Array<{ day: string; label: string; taken: number; missed: number; open: number }> }) {
  const { t } = useTheme();
  const decided = days.reduce((n, d) => n + d.taken + d.missed, 0);
  const taken = days.reduce((n, d) => n + d.taken, 0);
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
        {days.map((d) => {
          const total = d.taken + d.missed + d.open || 1;
          return (
            <View key={d.day} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{ height: 76, width: "100%", maxWidth: 34, borderRadius: 17, overflow: "hidden", backgroundColor: t.surfaceAlt, justifyContent: "flex-end" }}>
                <View style={{ height: `${(d.missed / total) * 100}%`, backgroundColor: t.danger }} />
                <View style={{ height: `${(d.taken / total) * 100}%`, backgroundColor: t.good }} />
              </View>
              <T size={11} muted>{d.label}</T>
            </View>
          );
        })}
      </View>
      <T size={13} muted style={{ marginTop: 10 }}>
        {decided ? `${Math.round((100 * taken) / decided)}% of doses confirmed this week (${taken} of ${decided}).` : "No doses confirmed yet this week."}
      </T>
    </View>
  );
}

/** A small line chart (blood pressure, sugar). Flagged readings get a red ring. */
export function VitalsChart({ vitals, kind, title, unit, band }: { vitals: Vital[]; kind: Vital["kind"]; title: string; unit: string; band: [number, number] }) {
  const { t } = useTheme();
  const rows = vitals.filter((v) => v.kind === kind);
  if (rows.length === 0) return null;
  const W = 320, H = 150, pad = { l: 34, r: 8, t: 10, b: 20 };
  const days = 30;
  const t1 = Date.now(), t0 = t1 - days * 86_400_000;
  const series: Array<{ name: string; color: string; pts: Array<{ x: number; v: number; f: boolean }> }> = [
    { name: kind === "bp" ? "Top" : title, color: t.text, pts: rows.map((v) => ({ x: new Date(v.measured_at).getTime(), v: v.value, f: v.flagged })) },
  ];
  if (kind === "bp") series.push({ name: "Bottom", color: t.accent, pts: rows.filter((v) => v.value2 !== null).map((v) => ({ x: new Date(v.measured_at).getTime(), v: v.value2 as number, f: v.flagged })) });
  const all = series.flatMap((s) => s.pts.map((p) => p.v)).concat(band);
  const lo = Math.floor((Math.min(...all) - 6) / 10) * 10, hi = Math.ceil((Math.max(...all) + 6) / 10) * 10;
  const X = (x: number) => pad.l + ((x - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const last = series.map((s) => Math.round(s.pts.at(-1)?.v ?? 0)).join(" / ");
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: 20, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <T weight="semi">{title}</T>
        <T size={13} muted>{`Latest ${last} ${unit}`}</T>
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={pad.l} y={Y(band[1])} width={W - pad.l - pad.r} height={Math.max(0, Y(band[0]) - Y(band[1]))} fill={t.goodBg} />
        {[lo, (lo * 2 + hi) / 3, (lo + hi * 2) / 3, hi].map((tk) => (
          <G key={tk}>
            <Line x1={pad.l} x2={W - pad.r} y1={Y(tk)} y2={Y(tk)} stroke={t.border} strokeWidth={1} />
            <SvgText x={pad.l - 6} y={Y(tk) + 4} fontSize={10} fill={t.textMuted} textAnchor="end">{Math.round(tk)}</SvgText>
          </G>
        ))}
        {series.map((s) => (
          <G key={s.name}>
            <Polyline points={s.pts.map((p) => `${X(p.x)},${Y(p.v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" />
            {s.pts.map((p) => (
              <G key={p.x}>
                {p.f ? <SvgCircle cx={X(p.x)} cy={Y(p.v)} r={7} fill="none" stroke={t.danger} strokeWidth={2} /> : null}
                <SvgCircle cx={X(p.x)} cy={Y(p.v)} r={3} fill={s.color} />
              </G>
            ))}
          </G>
        ))}
      </Svg>
      <View style={{ flexDirection: "row", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
        {series.map((s) => (
          <View key={s.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color }} />
            <T size={12} muted>{s.name}</T>
          </View>
        ))}
        <T size={12} muted>Red ring = told the family</T>
      </View>
    </View>
  );
}

export function BackHeader({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  const { t } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12} style={{ alignSelf: "flex-start", paddingVertical: 6 }}>
        <T weight="semi" color={t.textMuted}>{"‹ Back"}</T>
      </Pressable>
    </View>
  );
}
