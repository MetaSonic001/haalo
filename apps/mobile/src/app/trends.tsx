import { HeartPulse, Sparkles, TrendingDown } from "lucide-react-native";
import { View } from "react-native";
import { BackHeader, ParentPills, SectionTitle } from "@/components/care";
import { Card, Chip, Display, Empty, Screen, T } from "@/components/ui";
import { useCare } from "@/lib/care";
import { useFamily } from "@/lib/family";
import { goBack } from "@/lib/nav";
import { useTheme } from "@/lib/theme";

const sev = { info: ["good", "Good to know", Sparkles], watch: ["warn", "Worth watching", TrendingDown], concern: ["danger", "Worth a call", HeartPulse] } as const;
const order = { concern: 0, watch: 1, info: 2 } as const;

export default function Trends() {
  const { t } = useTheme();
  const { parent } = useFamily();
  const care = useCare(parent?.id);
  const name = parent ? parent.honorific || parent.name : "";
  const digest = care.data?.digest;
  const insights = [...(care.data?.insights ?? [])].sort((a, b) => order[a.severity] - order[b.severity]);
  const mood = digest?.data.avg_mood;

  return (
    <Screen>
      <BackHeader title="Trends" onBack={() => goBack()} />
      <ParentPills />
      <Display>Trends</Display>
      <T muted style={{ marginBottom: 14 }}>{`Small changes show up over weeks, not in one call. Sneha watches mood, how much ${name || "they"} talk, sleep, meals, medicines and blood pressure.`}</T>

      {digest?.summary ? (
        <View style={{ backgroundColor: "#1B2246", borderRadius: 24, padding: 22, gap: 10, marginBottom: 16 }}>
          <T size={13} color="#FFFFFFB3">{`This week with ${name}`}</T>
          <T size={19} weight="semi" color="#FFFFFF">{digest.summary}</T>
          <View style={{ flexDirection: "row", gap: 24, marginTop: 6 }}>
            <View><T size={12} color="#FFFFFF99">Calls</T><T size={20} weight="bold" color="#FFFFFF">{String(digest.data.calls ?? 0)}</T></View>
            <View><T size={12} color="#FFFFFF99">Doses</T><T size={20} weight="bold" color="#FFFFFF">{digest.data.adherence_pct != null ? `${digest.data.adherence_pct}%` : "-"}</T></View>
            <View><T size={12} color="#FFFFFF99">Mood</T><T size={20} weight="bold" color="#FFFFFF">{mood == null ? "-" : mood >= 1.4 ? "Cheerful" : mood >= 0.9 ? "Mixed" : "Low"}</T></View>
          </View>
        </View>
      ) : null}

      <SectionTitle>What Sneha noticed</SectionTitle>
      <View style={{ gap: 10, marginTop: 8 }}>
        {insights.length === 0 ? <Empty>Sneha needs a few more calls to see a pattern. Trends appear after about a week.</Empty> : null}
        {insights.map((i) => {
          const [tone, word, Icon] = sev[i.severity];
          return (
            <Card key={i.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Chip tone={tone}>{word}</Chip>
                <Icon size={16} color={t.textMuted} />
              </View>
              <T weight="semi" size={18}>{i.title}</T>
              <T size={15}>{i.body}</T>
            </Card>
          );
        })}
      </View>
      <T size={12} muted style={{ marginTop: 14 }}>Sneha compares this week with the weeks before. It never diagnoses: it tells you when a call or a visit might be worth it.</T>
    </Screen>
  );
}
