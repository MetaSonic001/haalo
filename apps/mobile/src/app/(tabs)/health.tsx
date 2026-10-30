import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Activity, Camera, Copy, Droplets, Image as ImageIcon, Pill } from "lucide-react-native";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ParentPills, SectionTitle, VitalsChart } from "@/components/care";
import { Button, Card, Chip, Display, Empty, Row, T } from "@/components/ui";
import { useCare } from "@/lib/care";
import { config } from "@/lib/config";
import { useFamily } from "@/lib/family";
import { fmtDay, fmtTime } from "@/lib/format";
import { useTheme } from "@/lib/theme";

const label = { bp: "Blood pressure", sugar: "Blood sugar", weight: "Weight", temperature: "Temperature", spo2: "Oxygen", pulse: "Pulse" } as const;
const kindIcon = { pill: Pill, bp: Activity, sugar: Droplets, other: ImageIcon } as const;

export default function Health() {
  const { t } = useTheme();
  const { parent } = useFamily();
  const care = useCare(parent?.id);
  const [copied, setCopied] = useState(false);
  const d = care.data;
  const name = parent ? parent.honorific || parent.name : "";
  const recent = [...(d?.vitals ?? [])].reverse().slice(0, 6);
  const link = d?.proofToken ? `${config.webUrl}/p/${d.proofToken}` : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 64, paddingBottom: 40, gap: 14 }}
      refreshControl={<RefreshControl refreshing={care.loading} onRefresh={() => void care.refresh()} tintColor={t.text} />}
    >
      <ParentPills />
      <Display>Health</Display>
      <T muted>{`Readings ${name || "they"} mention on a call, or show in a photo. Sneha only records them and tells you when one is outside your family's range. It never gives medical advice.`}</T>

      <VitalsChart vitals={d?.vitals ?? []} kind="bp" title="Blood pressure" unit="mmHg" band={[90, 140]} />
      <VitalsChart vitals={d?.vitals ?? []} kind="sugar" title="Blood sugar" unit="mg/dL" band={[70, 180]} />
      {(d?.vitals ?? []).length === 0 ? <Empty>No readings yet. When they say "my BP is 130 over 85" on a call, it shows up here.</Empty> : null}

      {recent.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionTitle>Recent readings</SectionTitle>
          {recent.map((v) => (
            <Row key={v.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <T weight="semi">{label[v.kind]}</T>
                <T size={12} muted>{`${v.source === "photo" ? "from a photo · " : ""}${fmtDay(v.measured_at)}, ${fmtTime(v.measured_at)}`}</T>
              </View>
              <T weight="bold" size={18}>{v.kind === "bp" ? `${Math.round(v.value)}/${Math.round(v.value2 ?? 0)}` : `${Math.round(v.value * 10) / 10}`}</T>
              {v.flagged ? <Chip tone="danger">Told you</Chip> : <Chip tone="good">In range</Chip>}
            </Row>
          ))}
        </View>
      ) : null}

      <SectionTitle>Photo proof (optional)</SectionTitle>
      <T muted size={14}>{`If ${name || "they"} have a smartphone, they can open their own link and tap one button to show a medicine strip or a BP monitor.`}</T>
      {link ? (
        <Card style={{ gap: 10 }}>
          <T size={13} muted numberOfLines={1}>{link}</T>
          <Button
            title={copied ? "Copied" : `Copy ${name}'s link`}
            icon={copied ? Camera : Copy}
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          />
        </Card>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {(d?.proofs ?? []).map((p) => {
          const Icon = kindIcon[p.kind];
          return (
            <View key={p.id} style={{ width: "48%", backgroundColor: t.surface, borderRadius: 16, overflow: "hidden" }}>
              {p.url ? <Image source={{ uri: p.url }} style={{ width: "100%", aspectRatio: 4 / 3 }} contentFit="cover" /> : <View style={{ aspectRatio: 4 / 3, alignItems: "center", justifyContent: "center" }}><Icon size={32} color={t.textMuted} /></View>}
              <View style={{ padding: 10, gap: 2 }}>
                <T size={13} weight="semi" numberOfLines={2}>{p.summary || "Photo saved"}</T>
                <T size={11} muted>{fmtDay(p.created_at)}</T>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
