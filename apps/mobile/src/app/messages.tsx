import { CheckCheck, HelpCircle, Heart, Send } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BackHeader, ParentPills, SectionTitle } from "@/components/care";
import { Button, Card, Chip, Display, Empty, Screen, T } from "@/components/ui";
import { act, useCare } from "@/lib/care";
import { useFamily } from "@/lib/family";
import { fmtDay, fmtTime } from "@/lib/format";
import { goBack } from "@/lib/nav";
import { useTheme } from "@/lib/theme";

export default function Messages() {
  const { t, radius } = useTheme();
  const { parent } = useFamily();
  const care = useCare(parent?.id);
  const [kind, setKind] = useState<"note" | "question">("note");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const name = parent ? parent.honorific || parent.name : "";
  const mine = (care.data?.messages ?? []).filter((m) => m.parent_id === parent?.id);

  const send = async () => {
    if (!parent) return;
    setBusy(true);
    try {
      await act("sendMessage", parent.id, { kind, body });
      setBody("");
      setMsg({ text: `Saved. Sneha will say it to ${name} on the next call.` });
      void care.refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't send that.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackHeader title="Messages" onBack={() => goBack()} />
      <ParentPills />
      <Display>Messages</Display>
      <T muted style={{ marginBottom: 14 }}>{`Say something to ${name || "them"} through Sneha. It is said in their language on the next call, and their answer comes back here.`}</T>

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(
            [["note", "A message", Heart], ["question", "A question", HelpCircle]] as const
          ).map(([k, label, Icon]) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={{ flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: kind === k ? t.text : t.border, backgroundColor: kind === k ? t.text : t.bg }}>
              <Icon size={15} color={kind === k ? t.bg : t.text} />
              <T size={14} weight="semi" color={kind === k ? t.bg : t.text}>{label}</T>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={400}
          placeholder={kind === "note" ? "Aarav scored 92 in his maths test!" : "Did the plumber come to fix the tap?"}
          placeholderTextColor={t.textMuted}
          accessibilityLabel="Message"
          style={{ minHeight: 84, backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: radius.input, padding: 14, fontSize: 16, color: t.text, fontFamily: "AnekLatin_400Regular", textAlignVertical: "top" }}
        />
        {msg ? <T size={14} color={msg.bad ? t.danger : t.good}>{msg.text}</T> : null}
        <Button title="Send to Sneha" icon={Send} disabled={busy || body.trim().length < 2} onPress={send} />
      </Card>

      <View style={{ gap: 10, marginTop: 18 }}>
        <SectionTitle>{`Messages for ${name}`}</SectionTitle>
        {mine.length === 0 ? <Empty>Nothing yet. Notes and questions are delivered on the next call.</Empty> : null}
        {mine.map((m) => (
          <Card key={m.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Chip tone={m.status === "queued" ? "warn" : "good"}>{m.status === "queued" ? "Waiting for the next call" : m.status === "answered" ? "Answered" : "Delivered"}</Chip>
              <T size={13} muted>{`${m.from_name} · ${fmtDay(m.created_at)}, ${fmtTime(m.created_at)}`}</T>
            </View>
            <T size={16}>{m.body}</T>
            {m.reply_text ? (
              <View style={{ flexDirection: "row", gap: 8, backgroundColor: t.bg, borderRadius: 12, padding: 12 }}>
                <CheckCheck size={18} color={t.good} />
                <T style={{ flex: 1 }} size={15}>{`${name} said: ${m.reply_text}`}</T>
              </View>
            ) : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
