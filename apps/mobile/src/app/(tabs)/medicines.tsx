import { Phone, Pill, ShieldAlert } from "lucide-react-native";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { DoseRow, ParentPills, SectionTitle, WeekBars } from "@/components/care";
import { Button, Card, Chip, Display, Empty, T } from "@/components/ui";
import { act, dayKey, todayKey, useCare } from "@/lib/care";
import { useFamily } from "@/lib/family";
import { useTheme } from "@/lib/theme";

export default function Medicines() {
  const { t } = useTheme();
  const { parent } = useFamily();
  const care = useCare(parent?.id);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = care.data;
  const name = parent ? parent.honorific || parent.name : "";
  const today = (d?.doses ?? []).filter((x) => dayKey(x.due_at) === todayKey());

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setMsg({ text: ok });
      void care.refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Something went wrong.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 64, paddingBottom: 40, gap: 14 }}
      refreshControl={<RefreshControl refreshing={care.loading} onRefresh={() => void care.refresh()} tintColor={t.text} />}
    >
      <ParentPills />
      <Display>Medicines</Display>
      <T muted>{parent ? `Sneha reminds ${name} at each dose, asks them to confirm, and tells you if it isn't confirmed.` : "Add a parent to track their medicines."}</T>
      {msg ? <T size={14} color={msg.bad ? t.danger : t.good}>{msg.text}</T> : null}

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T weight="semi" size={20}>Today</T>
        </View>
        {today.length === 0 ? <T muted>{d ? "No doses scheduled today." : "Loading..."}</T> : today.map((x) => (
          <DoseRow key={x.id + x.status} d={x} onTaken={(dose) => run(() => act("markDoseTaken", dose.id), "Marked as taken.")} />
        ))}
        {parent ? <Button title={`Remind ${name} now`} icon={Phone} variant="secondary" disabled={busy} onPress={() => run(async () => { await act("remindNow", parent.id); }, `${name}'s phone is ringing with the reminder.`)} /> : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <T weight="semi" size={20}>This week</T>
        <WeekBars days={d?.week ?? []} />
      </Card>

      <SectionTitle>Medicine list</SectionTitle>
      {d && d.medicines.length === 0 ? <Empty>No medicines yet. Add them on the website or in Settings.</Empty> : null}
      {(d?.medicines ?? []).map((m) => {
        const left = m.stock_count === null ? null : m.stock_count / Math.max(1, m.pills_per_dose * Math.max(1, m.times.length));
        const low = left !== null && left <= 5;
        return (
          <Card key={m.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
                <Pill size={19} color={t.text} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="semi" size={17}>{m.name}{m.dose_text ? <T muted>{`  ${m.dose_text}`}</T> : null}</T>
                <T size={13} muted>{`${m.purpose ? `${m.purpose} · ` : ""}${m.times.join(", ")}`}</T>
              </View>
              {m.critical ? <Chip tone="danger">Important</Chip> : null}
            </View>
            {left !== null ? (
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <T size={12} muted>{`${m.stock_count} left`}</T>
                  <T size={12} muted color={low ? t.warn : undefined}>{low ? `Running low · about ${Math.max(0, Math.floor(left))} days` : `about ${Math.floor(left)} days`}</T>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: "hidden", marginTop: 4 }}>
                  <View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, (left / 30) * 100)}%`, backgroundColor: low ? t.warn : t.good }} />
                </View>
              </View>
            ) : null}
            {m.critical ? (
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <ShieldAlert size={14} color={t.textMuted} />
                <T size={12} muted style={{ flex: 1 }}>A missed dose alerts the whole family.</T>
              </View>
            ) : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}
