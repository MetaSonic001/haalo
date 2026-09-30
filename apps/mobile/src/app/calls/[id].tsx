import { goBack } from "@/lib/nav";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, ChevronDown, Circle } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Card, Chip, Display, MoodBadge, Screen, T } from "@/components/ui";
import { loadCall } from "@/lib/data";
import { fmtDay, fmtDuration, fmtTime } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useCached } from "@/lib/use-cached";

const sentence = (n: string, m?: string | null) =>
  m === "good" ? `${n} sounded cheerful` : m === "okay" ? `${n} sounded okay` : m === "low" ? `${n} sounded a bit low` : `Call with ${n}`;

export default function CallDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTheme();
  const call = useCached(`call:${id}`, () => loadCall(id), [id]);
  const [open, setOpen] = useState(false);
  const [translated, setTranslated] = useState(false);

  if (!call.data) {
    return (
      <Screen>
        <Pressable onPress={() => goBack()} accessibilityLabel="Back"><ArrowLeft size={24} color={t.text} /></Pressable>
        {call.loading ? <ActivityIndicator color={t.text} style={{ marginTop: 40 }} /> : <T muted>We couldn&apos;t load this call.</T>}
      </Screen>
    );
  }
  const { call: c, summary, turns, parent } = call.data;
  const name = parent?.honorific || parent?.name || "them";
  const d = summary?.data;

  return (
    <Screen>
      <Pressable onPress={() => goBack()} accessibilityLabel="Back" hitSlop={12} style={{ marginBottom: 12 }}>
        <ArrowLeft size={24} color={t.text} />
      </Pressable>
      <Card style={{ gap: 10, marginBottom: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Display size={24} style={{ flex: 1 }}>{sentence(name, summary?.mood)}</Display>
          {summary ? <MoodBadge mood={summary.mood} /> : <Chip>{c.status.replace("_", " ")}</Chip>}
        </View>
        <T muted size={14}>{`${fmtDay(c.started_at ?? c.created_at)} at ${fmtTime(c.started_at)} · ${fmtDuration(c.duration_s)}`}</T>
        {summary ? <T size={17}>{summary.summary_for_family}</T> : null}
        {c.status === "failed" && c.error_detail ? <T color={t.danger} size={14}>{c.error_detail}</T> : null}
      </Card>

      {d ? (
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 8 }}>
            <T weight="semi" size={18}>Medicines</T>
            {d.meds.length === 0 ? <T muted>Nothing about medicines came up.</T> : null}
            {d.meds.map((m) => (
              <View key={m.name} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                {m.taken ? <Check size={20} color={t.good} strokeWidth={3} /> : <Circle size={20} color={t.textMuted} />}
                <T>{`${m.name} · ${m.taken ? "taken" : "not yet"}`}</T>
              </View>
            ))}
            <T muted size={13}>{`Ate: ${d.ate === true ? "yes" : d.ate === false ? "not yet" : "unclear"} · Sleep: ${d.slept}`}</T>
          </Card>
          {([["Highlights", d.highlights, "No highlights this time."], ["Complaints", d.complaints, "None mentioned."], ["Haalo will follow up on", d.follow_ups, "Nothing to follow up."]] as const).map(([title, items, empty]) => (
            <Card key={title} style={{ gap: 6 }}>
              <T weight="semi" size={18}>{title}</T>
              {items.length ? items.map((i) => <T key={i}>{`· ${i}`}</T>) : <T muted>{empty}</T>}
            </Card>
          ))}
        </View>
      ) : null}

      {turns.length > 0 ? (
        <Card style={{ marginTop: 12, gap: 10 }}>
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <T weight="semi" size={18}>Full conversation</T>
              <T muted size={13}>{`${turns.length} turns · visible only to your family`}</T>
            </View>
            <ChevronDown size={22} color={t.text} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
          </Pressable>
          {open ? (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["Original", "English"] as const).map((label) => {
                  const on = (label === "English") === translated;
                  return (
                    <Pressable key={label} onPress={() => setTranslated(label === "English")} style={{ backgroundColor: on ? t.text : t.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                      <T size={14} color={on ? t.bg : t.text}>{label}</T>
                    </Pressable>
                  );
                })}
              </View>
              {turns.map((turn) => {
                const tt = (turn as { translated_text?: string | null }).translated_text;
                const isParent = turn.speaker === "parent";
                return (
                  <View key={turn.id} style={{ alignItems: isParent ? "flex-end" : "flex-start" }}>
                    <View style={{ maxWidth: "88%", backgroundColor: isParent ? t.accent : t.bg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <T size={12} weight="semi" color={isParent ? t.onAccent : t.textMuted}>{isParent ? name : "Haalo"}</T>
                      <T color={isParent ? t.onAccent : t.text}>{translated ? (tt ?? "Translation not generated yet") : (turn.corrected_text ?? turn.text)}</T>
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
