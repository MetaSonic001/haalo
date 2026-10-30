import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Chip, Display, Empty, MoodBadge, Row, Screen, T } from "@/components/ui";
import { loadToday, type TodayData } from "@/lib/data";
import { fmtDay, fmtDuration, fmtTime } from "@/lib/format";
import { useFamily } from "@/lib/family";
import { useCached } from "@/lib/use-cached";

const label: Record<string, string> = {
  queued: "Scheduled", dialing: "Calling", in_progress: "On the call", completed: "Completed", no_answer: "No answer",
  no_response: "Didn't respond", failed: "Couldn't connect", missed: "Missed",
};

export default function Calls() {
  const { parent } = useFamily();
  const today = useCached<TodayData | null>(`today:${parent?.id}`, async () => (parent ? loadToday(parent.id) : null), [parent?.id]);
  const calls = today.data?.recent ?? [];
  return (
    <Screen>
      <Display>Calls</Display>
      <T muted style={{ marginBottom: 16 }}>{parent ? `Every conversation Sneha has had with ${parent.honorific || parent.name}.` : "Add a parent to see their calls."}</T>
      {calls.length === 0 ? (
        <Empty>No calls yet. The first one will appear here after Sneha rings.</Empty>
      ) : (
        <View style={{ gap: 8 }}>
          {calls.map((c) => (
            <Pressable key={c.id} onPress={() => router.push(`/calls/${c.id}`)} accessibilityRole="button">
              <Row style={{ gap: 6, paddingVertical: 14 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T weight="semi">{`${fmtDay(c.started_at ?? c.created_at)}, ${fmtTime(c.started_at ?? c.scheduled_for)}`}</T>
                  {c.summary ? <MoodBadge mood={c.summary.mood} /> : <Chip tone={c.status === "failed" ? "danger" : "neutral"}>{label[c.status] ?? c.status}</Chip>}
                </View>
                <T muted numberOfLines={2}>{c.summary?.summary_for_family ?? c.error_detail ?? label[c.status]}</T>
                {c.duration_s ? <T muted size={13}>{fmtDuration(c.duration_s)}</T> : null}
              </Row>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
