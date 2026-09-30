import * as Clipboard from "expo-clipboard";
import { Link2, Share2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Share, Switch, View } from "react-native";
import { Button, Card, Chip, Display, Screen, T } from "@/components/ui";
import { createInvite, updateAlertPrefs, type Member } from "@/lib/data";
import { useFamily } from "@/lib/family";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { config } from "@/lib/config";

const PREFS: Array<[keyof Member["alert_prefs"], string, string]> = [
  ["emergency", "Emergencies and scams", "Falls, chest pain, distress, suspicious callers"],
  ["summary", "Daily summary", "A two-line note after each call"],
  ["missed", "Missed calls", "When Haalo couldn't reach them two days running"],
];

export default function FamilyTab() {
  const { t } = useTheme();
  const { family } = useFamily();
  const { userId } = useSession();
  const me = family?.members.find((m) => m.user_id === userId) ?? family?.members[0];
  const [prefs, setPrefs] = useState<Member["alert_prefs"]>(me?.alert_prefs ?? { emergency: true, summary: true, missed: true });
  const [invite, setInvite] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me) setPrefs(me.alert_prefs); }, [me?.alert_prefs?.emergency, me?.alert_prefs?.summary, me?.alert_prefs?.missed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!family?.familyId) {
    return (
      <Screen>
        <Display>Family</Display>
        <T muted>Add a parent first, and your family circle will appear here.</T>
      </Screen>
    );
  }
  const isOwner = config.demo || me?.role === "owner";
  const url = invite ? `https://haalo.app/invite/${invite}` : "";

  return (
    <Screen>
      <Display>Family</Display>
      <T muted style={{ marginBottom: 16 }}>Everyone in the circle sees the same calls, and shares the peace of mind.</T>

      <Card style={{ gap: 12, marginBottom: 16 }}>
        <T weight="semi" size={20}>Family circle</T>
        {family.members.map((m) => (
          <View key={m.user_id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
              <T weight="bold" color={t.onAccent}>{m.name.slice(0, 1).toUpperCase()}</T>
            </View>
            <T style={{ flex: 1 }}>{m.name}{m.user_id === userId ? " (you)" : ""}</T>
            <Chip tone={m.role === "owner" ? "accent" : "neutral"}>{m.role === "owner" ? "Owner" : "Member"}</Chip>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 14, marginBottom: 16 }}>
        <T weight="semi" size={20}>Your alerts</T>
        {PREFS.map(([k, title, hint]) => (
          <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T weight="semi">{title}</T>
              <T muted size={13}>{hint}</T>
            </View>
            <Switch
              value={prefs[k]}
              accessibilityLabel={title}
              onValueChange={async (v) => {
                const next = { ...prefs, [k]: v };
                setPrefs(next);
                try { await updateAlertPrefs(family.familyId!, userId, next); } catch (e) { setPrefs(prefs); setErr(e instanceof Error ? e.message : "Couldn't save"); }
              }}
              trackColor={{ true: t.good, false: t.border }}
            />
          </View>
        ))}
        {err ? <T size={14} color={t.danger}>{err}</T> : null}
      </Card>

      {isOwner ? (
        <Card style={{ gap: 12 }}>
          <T weight="semi" size={20}>Invite a sibling or spouse</T>
          <T muted size={14}>They&apos;ll see the same calls and alerts. The link works once and expires in 7 days.</T>
          {invite ? (
            <>
              <T size={14} selectable>{url}</T>
              <Button title="Share link" icon={Share2} variant="secondary" onPress={() => Share.share({ message: `Join our Haalo family circle: ${url}` })} />
              <Button title="Copy link" icon={Link2} variant="ghost" onPress={() => Clipboard.setStringAsync(url)} />
            </>
          ) : (
            <Button title="Create invite link" icon={Link2} onPress={async () => { try { setInvite(await createInvite(family.familyId!, userId)); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't create link"); } }} />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
