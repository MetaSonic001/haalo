import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { AlertTriangle, Check, Circle, PhoneCall, Plus, Settings } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Orb } from "@/components/orb";
import { Button, Card, Chip, Display, MoodBadge, Row, Screen, T } from "@/components/ui";
import { callNow, loadToday, type TodayData } from "@/lib/data";
import { DoseRow, ParentPills } from "@/components/care";
import { dayKey, todayKey, useCare, POLL_MS } from "@/lib/care";
import { Activity, CalendarDays, Droplets, MessageCircleHeart, TrendingDown } from "lucide-react-native";
import { useFamily } from "@/lib/family";
import { useTheme } from "@/lib/theme";
import { useCached } from "@/lib/use-cached";
import { go } from "@/lib/nav";
import { fmtClock, fmtDay, fmtDuration, fmtTime } from "@/lib/format";

const sentence = (name: string, mood?: string | null) =>
  mood === "good" ? `${name} sounded cheerful today` : mood === "okay" ? `${name} sounded okay today` : mood === "low" ? `${name} sounded a bit low today` : `Hard to tell how ${name} was today`;

function Tick({ done }: { done?: boolean }) {
  const { t } = useTheme();
  const s = useSharedValue(done ? 0.4 : 1);
  if (done) s.value = withSpring(1, { stiffness: 500, damping: 14 });
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return done ? (
    <Animated.View style={[{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.good, alignItems: "center", justifyContent: "center" }, style]}>
      <Check size={16} color={t.bg} strokeWidth={3} />
    </Animated.View>
  ) : (
    <Circle size={28} color={t.textMuted} strokeWidth={1.5} />
  );
}

export default function Today() {
  const { t, fs } = useTheme();
  const { parent, loading: famLoading, refresh, stale } = useFamily();
  const today = useCached<TodayData | null>(`today:${parent?.id}`, async () => (parent ? loadToday(parent.id) : null), [parent?.id], { pollMs: POLL_MS });
  const care = useCare(parent?.id);
  const [calling, setCalling] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  if (!parent) {
    return (
      <Screen>
        <View style={{ alignItems: "center", gap: 16, paddingTop: 24 }}>
          <Orb size={160} />
          <Display size={fs(28)} style={{ textAlign: "center" }}>Let&apos;s set up the first call.</Display>
          <T muted style={{ textAlign: "center" }}>It takes about three minutes. Sneha rings their ordinary phone, no app needed.</T>
          <Button title="Add a parent" icon={Plus} onPress={() => router.push("/add-parent")} />
        </View>
      </Screen>
    );
  }

  const name = parent.honorific || parent.name;
  const d = today.data;
  const latest = d?.latest;
  const summary = latest?.summary;
  const taken = new Map((summary?.data.meds ?? []).map((m) => [m.name.toLowerCase(), m.taken]));
  const callTime = fmtClock(d?.schedule?.window_start).replace(/ (am|pm)$/, "") || "9:00";
  const c = care.data;
  const todayDoses = (c?.doses ?? []).filter((x) => dayKey(x.due_at) === todayKey());
  const lastBp = [...(c?.vitals ?? [])].reverse().find((v) => v.kind === "bp");
  const lastSugar = [...(c?.vitals ?? [])].reverse().find((v) => v.kind === "sugar");
  const topInsight = [...(c?.insights ?? [])].sort((a, b) => ({ concern: 0, watch: 1, info: 2 })[a.severity] - ({ concern: 0, watch: 1, info: 2 })[b.severity])[0];
  const nextAppt = (c?.appointments ?? []).find((a) => new Date(a.at).getTime() > Date.now());
  const queued = (c?.messages ?? []).filter((m) => m.status === "queued").length;

  const onCall = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCalling(true);
    try {
      await callNow(parent.id);
      setMsg({ text: `Sneha is calling ${name} now.` });
      void care.refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't start the call.", bad: true });
    }
    setTimeout(() => setCalling(false), 4000);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 64, paddingBottom: 40, gap: 16 }}
      refreshControl={<RefreshControl refreshing={famLoading || today.loading} onRefresh={() => { void refresh(); void today.refresh(); }} tintColor={t.text} />}
    >
      <ParentPills />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Display size={fs(28)}>{parent.name}</Display>
          <T muted>{parent.consent_status === "granted" ? "Agreed to daily calls" : parent.consent_status === "declined" ? "Declined the calls" : "Waiting for permission on the first call"}</T>
        </View>
        <Pressable accessibilityLabel="Settings" hitSlop={12} onPress={() => router.push("/settings")}>
          <Settings size={24} color={t.text} />
        </Pressable>
      </View>

      {stale ? <Chip tone="warn">Offline. Showing what we last saw.</Chip> : null}

      {(d?.openFlags.length ?? 0) > 0 ? (
        <Pressable
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            router.push("/(tabs)/alerts");
          }}
          accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.dangerBg, borderRadius: 14, padding: 14 }}
        >
          <AlertTriangle size={20} color={t.danger} />
          <T weight="semi" color={t.danger} style={{ flex: 1 }}>
            {d!.openFlags.length === 1 ? "1 alert needs your attention" : `${d!.openFlags.length} alerts need your attention`}
          </T>
        </Pressable>
      ) : null}

      <Card style={{ padding: 22, gap: 14 }}>
        {summary ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Display size={fs(24)}>{sentence(name, summary.mood)}</Display>
                <T muted size={14}>{`Called at ${fmtTime(latest?.started_at)} · ${fmtDuration(latest?.duration_s)}`}</T>
              </View>
              <MoodBadge mood={summary.mood} />
            </View>
            <T size={17}>{summary.summary_for_family}</T>
            {todayDoses.length === 0
              ? d!.medicines.map((m) => {
                  const did = taken.get(m.name.toLowerCase());
                  return (
                    <Row key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.bg }}>
                      <Tick done={did} />
                      <View style={{ flex: 1 }}>
                        <T>{m.name}</T>
                        <T size={13} muted>{did ? "Taken" : did === false ? "Not yet" : "Not mentioned"}</T>
                      </View>
                    </Row>
                  );
                })
              : todayDoses.map((x) => <DoseRow key={x.id + x.status} d={x} />)}
            {summary.data.highlights.slice(0, 2).map((h) => (
              <T key={h} muted>{`· ${h}`}</T>
            ))}
            <Button title="Read the full call" variant="secondary" onPress={() => router.push(`/calls/${latest!.id}`)} />
          </>
        ) : (
          <View style={{ alignItems: "center", gap: 12 }}>
            <Orb size={140} />
            <Display size={fs(22)} style={{ textAlign: "center" }}>
              {parent.consent_status === "declined" ? `${name} asked us not to call` : `Sneha will call ${name} at ${callTime} tomorrow.`}
            </Display>
            <T muted style={{ textAlign: "center" }}>
              {parent.consent_status === "declined" ? "Sneha has stopped calling. You may want to talk with them first." : "You'll get a summary here."}
            </T>
          </View>
        )}
        {parent.consent_status !== "declined" ? (
          <Button
            title={calling ? `Calling ${name}` : `Call ${name} now`}
            icon={PhoneCall}
            haptic="none"
            disabled={calling}
            onPress={onCall}
          />
        ) : null}
        {calling ? (
          <View style={{ alignItems: "center" }}>
            <Orb size={120} live />
          </View>
        ) : null}
        {msg ? <T size={14} color={msg.bad ? t.danger : t.good}>{msg.text}</T> : null}
      </Card>

      {topInsight && topInsight.severity !== "info" ? (
        <Pressable accessibilityRole="button" onPress={() => go("/trends")} style={{ flexDirection: "row", gap: 12, backgroundColor: t.warnBg, borderRadius: 18, padding: 16 }}>
          <TrendingDown size={20} color={t.warn} />
          <View style={{ flex: 1 }}>
            <T weight="semi" size={17} color={t.warn}>{topInsight.title}</T>
            <T size={14} color={t.warn}>{topInsight.body}</T>
          </View>
        </Pressable>
      ) : null}

      {lastBp || lastSugar || nextAppt || queued > 0 ? (
        <View style={{ gap: 8 }}>
          {lastBp ? (
            <Pressable accessibilityRole="button" onPress={() => go("/(tabs)/health")}>
              <Row style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Activity size={20} color={t.textMuted} />
                <View style={{ flex: 1 }}><T size={12} muted>{`Blood pressure · ${fmtDay(lastBp.measured_at)}`}</T><T weight="bold" size={18}>{`${Math.round(lastBp.value)}/${Math.round(lastBp.value2 ?? 0)}`}</T></View>
                <Chip tone={lastBp.flagged ? "danger" : "good"}>{lastBp.flagged ? "Outside range" : "In range"}</Chip>
              </Row>
            </Pressable>
          ) : null}
          {lastSugar ? (
            <Pressable accessibilityRole="button" onPress={() => go("/(tabs)/health")}>
              <Row style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Droplets size={20} color={t.textMuted} />
                <View style={{ flex: 1 }}><T size={12} muted>{`Blood sugar · ${fmtDay(lastSugar.measured_at)}`}</T><T weight="bold" size={18}>{String(Math.round(lastSugar.value))}</T></View>
                <Chip tone={lastSugar.flagged ? "danger" : "good"}>{lastSugar.flagged ? "Outside range" : "In range"}</Chip>
              </Row>
            </Pressable>
          ) : null}
          {nextAppt ? (
            <Pressable accessibilityRole="button" onPress={() => go("/calendar")}>
              <Row style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <CalendarDays size={20} color={t.textMuted} />
                <View style={{ flex: 1 }}><T size={12} muted>Next appointment</T><T weight="semi">{nextAppt.title}</T><T size={13} muted>{`${fmtDay(nextAppt.at)}, ${fmtTime(nextAppt.at)}`}</T></View>
              </Row>
            </Pressable>
          ) : null}
          {queued > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => go("/messages")}>
              <Row style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <MessageCircleHeart size={20} color={t.textMuted} />
                <View style={{ flex: 1 }}><T size={12} muted>Waiting for the next call</T><T weight="semi">{`${queued} message${queued === 1 ? "" : "s"} for ${name}`}</T></View>
              </Row>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {(d?.recent.length ?? 0) > 0 ? (
        <View style={{ gap: 8 }}>
          <T weight="semi" size={20}>Recent calls</T>
          {d!.recent.slice(0, 4).map((c) => (
            <Pressable key={c.id} onPress={() => router.push(`/calls/${c.id}`)} accessibilityRole="button">
              <Row style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <T weight="semi" size={14} style={{ width: 70 }}>{fmtDay(c.started_at ?? c.created_at)}</T>
                <T muted numberOfLines={1} style={{ flex: 1 }}>{c.summary?.summary_for_family ?? c.status.replace("_", " ")}</T>
                {c.summary ? <MoodBadge mood={c.summary.mood} /> : null}
              </Row>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

