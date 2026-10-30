import * as Haptics from "expo-haptics";
import { Phone } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import type { Flag } from "@haalo/db";
import { severityTone } from "@haalo/ui-tokens";
import { Button, Card, Chip, Display, Empty, Screen, T } from "@/components/ui";
import { setFlagStatus } from "@/lib/data";
import { fmtDay, fmtTime } from "@/lib/format";
import { useFamily } from "@/lib/family";
import { useSession } from "@/lib/session";

const order = { emergency: 0, high: 1, medium: 2, low: 3 } as const;

export default function Alerts() {
  const { flags, family, refresh } = useFamily();
  const { userId } = useSession();
  const [items, setItems] = useState<Flag[]>(flags);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setItems(flags), [flags]);
  const parents = Object.fromEntries((family?.parents ?? []).map((p) => [p.id, p]));

  // Opening an emergency alert gives a warning haptic.
  useEffect(() => {
    if (items.some((f) => f.status === "open" && f.severity === "emergency")) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (f: Flag, status: "acknowledged" | "resolved") => {
    setItems((l) => l.map((x) => (x.id === f.id ? { ...x, status } : x))); // optimistic: the card collapses at once
    try {
      await setFlagStatus(f.id, status, userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void refresh();
    } catch (e) {
      setItems((l) => l.map((x) => (x.id === f.id ? { ...x, status: f.status } : x)));
      setErr(e instanceof Error ? e.message : "Couldn't update that alert.");
    }
  };

  const open = items.filter((f) => f.status === "open").sort((a, b) => order[a.severity] - order[b.severity] || +new Date(b.created_at) - +new Date(a.created_at));
  const done = items.filter((f) => f.status !== "open");

  return (
    <Screen>
      <Display>Alerts</Display>
      <T muted style={{ marginBottom: 16 }}>Emergencies come first, with the exact words that were said.</T>
      {err ? <T color="#C8352C" size={14}>{err}</T> : null}
      {open.length === 0 ? <Empty>Nothing needs your attention. Sneha will tell you the moment something does.</Empty> : null}
      <View style={{ gap: 12 }}>
        {open.map((f) => {
          const p = parents[f.parent_id];
          const tone = severityTone[f.severity];
          return (
            <Card key={f.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Chip tone={tone.tone === "danger" ? "danger" : "warn"}>{tone.label}</Chip>
                <T weight="semi" style={{ textTransform: "capitalize" }}>{f.category.replace(/_/g, " ")}</T>
                <T muted size={13}>{`${fmtDay(f.created_at)}, ${fmtTime(f.created_at)}`}</T>
              </View>
              {f.evidence_quote ? <T size={17}>{`“${f.evidence_quote}”`}</T> : null}
              {p ? <Button title={`Call ${p.honorific || p.name} now`} icon={Phone} variant={f.severity === "emergency" || f.severity === "high" ? "danger" : "secondary"} onPress={() => Linking.openURL(`tel:${p.phone_e164}`)} /> : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Button title="Acknowledge" variant="secondary" haptic="none" onPress={() => act(f, "acknowledged")} /></View>
                <View style={{ flex: 1 }}><Button title="Resolve" variant="ghost" haptic="none" onPress={() => act(f, "resolved")} /></View>
              </View>
            </Card>
          );
        })}
      </View>
      {done.length > 0 ? (
        <View style={{ gap: 8, marginTop: 24 }}>
          <T weight="semi" size={18} muted>Earlier</T>
          {done.map((f) => (
            <View key={f.id} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Chip>{f.status === "resolved" ? "Resolved" : "Seen"}</Chip>
              <T style={{ textTransform: "capitalize", flex: 1 }}>{f.category.replace(/_/g, " ")}</T>
              <T muted size={13}>{fmtDay(f.created_at)}</T>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
