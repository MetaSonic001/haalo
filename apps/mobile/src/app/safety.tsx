import { BellRing, CheckCircle2, MessageSquareText, PhoneCall, ShieldCheck, TriangleAlert, Users } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { BackHeader, ParentPills, SectionTitle } from "@/components/care";
import { Button, Card, Chip, Display, Empty, Row, Screen, T } from "@/components/ui";
import { act, useCare } from "@/lib/care";
import { useFamily } from "@/lib/family";
import { fmtDay, fmtTime } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useTheme } from "@/lib/theme";

const triggerText = { emergency: "Emergency said on a call", missed_calls: "Several days of unanswered calls", missed_dose: "A missed important medicine", parent_request: "They asked for the family", manual_test: "Test of the alert ladder" } as const;
const tone = { sent: "good", answered: "good", acknowledged: "good", simulated: "warn", failed: "danger", no_answer: "warn", skipped: "neutral" } as const;
const word = { sent: "Sent", answered: "Answered", acknowledged: "Confirmed", simulated: "Simulated", failed: "Failed", no_answer: "No answer", skipped: "Skipped" } as const;
const icon = { family_push: BellRing, call: PhoneCall, sms: MessageSquareText } as const;

export default function Safety() {
  const { t } = useTheme();
  const { parent } = useFamily();
  const care = useCare(parent?.id);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = care.data;
  const name = parent ? parent.honorific || parent.name : "";
  const mine = (d?.contacts ?? []).filter((c) => c.parent_id === parent?.id || c.parent_id === null).sort((a, b) => a.priority - b.priority);

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
    <Screen>
      <BackHeader title="Safety" onBack={() => goBack()} />
      <ParentPills />
      <Display>Safety</Display>
      <T muted style={{ marginBottom: 12 }}>If something may be seriously wrong, Sneha alerts the family, then calls your emergency contacts one by one until someone says they are on it.</T>
      {msg ? <T size={14} color={msg.bad ? t.danger : t.good} style={{ marginBottom: 8 }}>{msg.text}</T> : null}

      <View style={{ gap: 10 }}>
        <SectionTitle>{`Who Sneha contacts for ${name}`}</SectionTitle>
        <Row style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.text, alignItems: "center", justifyContent: "center" }}><T size={13} weight="bold" color={t.bg}>0</T></View>
          <Users size={18} color={t.textMuted} />
          <View style={{ flex: 1 }}><T weight="semi">Everyone in the family</T><T size={12} muted>Push and in-app alert, straight away</T></View>
        </Row>
        {mine.map((c, i) => (
          <Row key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}><T size={13} weight="bold" color={t.onAccent}>{String(i + 1)}</T></View>
            <View style={{ flex: 1 }}>
              <T weight="semi">{c.name}{c.relation ? <T muted>{`  ${c.relation}`}</T> : null}</T>
              <T size={12} muted>{`${c.phone_e164} · call and text`}</T>
            </View>
          </Row>
        ))}
        {mine.length === 0 ? <Empty>No emergency contacts yet. Add one on the website.</Empty> : null}
        {parent ? <Button title="Test the alert ladder" icon={ShieldCheck} variant="secondary" disabled={busy} onPress={() => run(() => act("testEscalation", parent.id), "Test started. Watch it run below.")} /> : null}
      </View>

      <View style={{ gap: 12, marginTop: 20 }}>
        <SectionTitle>Alert history</SectionTitle>
        {(d?.escalations ?? []).length === 0 ? <Empty>No alerts have been raised. When one is, every step shows up here as it happens.</Empty> : null}
        {(d?.escalations ?? []).map((e) => (
          <Card key={e.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Chip tone={e.status === "open" ? "danger" : "good"}>{e.status === "open" ? "In progress" : "Resolved"}</Chip>
              <T weight="semi" style={{ flexShrink: 1 }}>{triggerText[e.trigger]}</T>
            </View>
            <T size={12} muted>{`${fmtDay(e.started_at)}, ${fmtTime(e.started_at)}`}</T>
            <T muted size={14}>{e.summary}</T>
            <View style={{ gap: 8, borderLeftWidth: 2, borderLeftColor: t.border, paddingLeft: 12 }}>
              {(e.escalation_events ?? []).map((ev) => {
                const Icon = ev.status === "acknowledged" ? CheckCircle2 : ev.status === "failed" ? TriangleAlert : icon[ev.channel];
                return (
                  <View key={ev.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Icon size={15} color={t.textMuted} />
                    <T size={14} weight="semi">{ev.label}</T>
                    <Chip tone={tone[ev.status]}>{word[ev.status]}</Chip>
                    <T size={12} muted>{fmtTime(ev.at)}</T>
                  </View>
                );
              })}
              {(e.escalation_events ?? []).length === 0 ? <T size={13} muted>Starting...</T> : null}
            </View>
            {e.status === "open" ? <Button title="I am on it - stop the alerts" variant="danger" disabled={busy} onPress={() => run(() => act("acknowledgeEscalation", e.id), "Thanks. The ladder has stopped.")} /> : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
