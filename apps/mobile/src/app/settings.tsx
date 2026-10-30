import { goBack } from "@/lib/nav";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { loadToday } from "@/lib/data";
import { Button, Card, Chip, Display, Screen, T } from "@/components/ui";
import { deleteParent, updateSchedule } from "@/lib/data";
import { DAYS } from "@/lib/format";
import { useFamily } from "@/lib/family";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useCached } from "@/lib/use-cached";

/** Profile sheet: schedule, pause, large text, consent status, data delete. */
export default function Settings() {
  const { t } = useTheme();
  const { largeText, setLargeText } = useTheme();
  const { parent, refresh } = useFamily();
  const { signOut, name } = useSession();
  const sched = useCached(`today:${parent?.id}`, async () => (parent ? loadToday(parent.id) : null), [parent?.id]);
  const [days, setDays] = useState<number[] | null>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const s = sched.data?.schedule;
  const curDays = days ?? s?.days_of_week ?? [0, 1, 2, 3, 4, 5, 6];
  const isPaused = paused ?? Boolean(s?.paused_until && new Date(s.paused_until) > new Date());
  const who = parent?.honorific || parent?.name || "them";

  const save = async (patch: Parameters<typeof updateSchedule>[1]) => {
    try {
      if (parent) await updateSchedule(parent.id, patch);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Display size={28}>Settings</Display>
        <Pressable onPress={() => goBack()} accessibilityRole="button"><T weight="semi">Done</T></Pressable>
      </View>
      <T muted style={{ marginBottom: 16 }}>{name}</T>

      <Card style={{ gap: 14, marginBottom: 16 }}>
        <T weight="semi" size={20}>Reading</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="semi">Large text</T>
            <T muted size={13}>Makes everything bigger. Also follows your phone&apos;s text size.</T>
          </View>
          <Switch value={largeText} onValueChange={setLargeText} accessibilityLabel="Large text" trackColor={{ true: t.good, false: t.border }} />
        </View>
      </Card>

      {parent ? (
        <>
          <Card style={{ gap: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T weight="semi" size={20}>{`Calls to ${who}`}</T>
              {isPaused ? <Chip tone="warn">Paused</Chip> : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DAYS.map((d, i) => {
                const on = curDays.includes(i);
                return (
                  <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { const n = on ? curDays.filter((x) => x !== i) : [...curDays, i].sort(); setDays(n); if (n.length) void save({ days_of_week: n }); }}
                    style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: on ? t.text : t.border, backgroundColor: on ? t.text : t.bg }}>
                    <T size={13} weight="semi" color={on ? t.bg : t.text}>{d}</T>
                  </Pressable>
                );
              })}
            </View>
            <Button
              title={isPaused ? "Resume calls" : "Pause calls"}
              variant="secondary"
              onPress={async () => { const next = !isPaused; setPaused(next); await save({ paused_until: next ? new Date(Date.now() + 365 * 86_400_000).toISOString() : null }); }}
            />
          </Card>

          <Card style={{ gap: 8, marginBottom: 16 }}>
            <T weight="semi" size={20}>Permission</T>
            <T>{parent.consent_status === "granted" ? `${who} agreed on the first call` : parent.consent_status === "declined" ? `${who} declined the calls` : "Waiting for the first call"}</T>
            <T muted size={13}>Recordings are off by default. Sneha keeps text transcripts only.</T>
          </Card>
        </>
      ) : null}

      <View style={{ gap: 10 }}>
        <Button title="Add another parent" icon={Plus} variant="secondary" onPress={() => router.push("/add-parent")} />
        {parent ? (
          confirm ? (
            <Button title={`Yes, delete everything for ${who}`} variant="danger" onPress={async () => { try { await deleteParent(parent.id); await refresh(); goBack(); } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't delete"); } }} />
          ) : (
            <Button title="Delete all data for this parent" variant="ghost" onPress={() => setConfirm(true)} />
          )
        ) : null}
        <Button title="Sign out" variant="ghost" onPress={async () => { await signOut(); router.replace("/welcome"); }} />
      </View>
      {msg ? <T muted size={14} style={{ marginTop: 12 }}>{msg}</T> : null}
    </Screen>
  );
}
