import { Cake, MapPin, Sparkles, Stethoscope } from "lucide-react-native";
import { View } from "react-native";
import { BackHeader, ParentPills, SectionTitle } from "@/components/care";
import { Card, Chip, Display, Empty, Row, Screen, T } from "@/components/ui";
import { useCare } from "@/lib/care";
import { useFamily } from "@/lib/family";
import { goBack } from "@/lib/nav";
import { useTheme } from "@/lib/theme";

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));
const dayOnly = (iso: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${iso}T12:00:00+05:30`));

export default function Calendar() {
  const { t } = useTheme();
  const { parent } = useFamily();
  const care = useCare(parent?.id);
  const name = parent ? parent.honorific || parent.name : "";
  const appts = (care.data?.appointments ?? []).filter((a) => a.parent_id === parent?.id);

  return (
    <Screen>
      <BackHeader title="Calendar" onBack={() => goBack()} />
      <ParentPills />
      <Display>Calendar</Display>
      <T muted style={{ marginBottom: 14 }}>Doctor visits, tests, festivals and birthdays. Sneha mentions them on the calls so nothing is forgotten.</T>

      <SectionTitle>Appointments</SectionTitle>
      <View style={{ gap: 10, marginTop: 8 }}>
        {appts.length === 0 ? <Empty>No appointments yet. Add one on the website and Sneha reminds them the day before.</Empty> : null}
        {appts.map((a) => (
          <Card key={a.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}><Stethoscope size={19} color={t.text} /></View>
              <View style={{ flex: 1 }}>
                <T weight="semi" size={17}>{a.title}{a.doctor ? <T muted>{`  ${a.doctor}`}</T> : null}</T>
                <T size={14} muted>{when(a.at)}</T>
              </View>
            </View>
            {a.location ? <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}><MapPin size={14} color={t.textMuted} /><T size={13} muted>{a.location}</T></View> : null}
            <Chip tone="accent">{`Sneha reminds ${name} on the call`}</Chip>
          </Card>
        ))}
      </View>

      <View style={{ marginTop: 20, gap: 8 }}>
        <SectionTitle>Festivals and birthdays</SectionTitle>
        <T size={13} muted>{`Sneha wishes ${name} on these days. Only festivals from the tradition you chose, never anyone else's.`}</T>
        {(care.data?.occasions ?? []).length === 0 ? <Empty>Nothing in the next ten weeks.</Empty> : null}
        {(care.data?.occasions ?? []).map((o) => (
          <Row key={o.date + o.name} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {o.name.includes("birthday") ? <Cake size={18} color={t.accent} /> : <Sparkles size={18} color={t.accent} />}
            <T weight="semi" style={{ flex: 1 }}>{o.name}</T>
            <T size={13} muted>{dayOnly(o.date)}</T>
          </Row>
        ))}
      </View>
    </Screen>
  );
}
