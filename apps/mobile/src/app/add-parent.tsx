import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { goBack } from "@/lib/nav";
import { router } from "expo-router";
import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { getLanguage, newParent, parentStep1, parentStep2, parentStep3, selectableLanguages, type NewParent } from "@haalo/shared";
import { Button, Chip, Display, Row, T } from "@/components/ui";
import { addParent } from "@/lib/data";
import { config } from "@/lib/config";
import { DAYS } from "@/lib/format";
import { useFamily } from "@/lib/family";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STEPS = ["Who they are", "Language", "Call time", "Medicines", "What they love"];
const SUGGEST = ["Cricket", "Bhajans", "Cooking", "Grandchildren", "A serial", "Gardening", "News", "Old songs"];

type Draft = Omit<Partial<NewParent>, "medicines" | "interests" | "family_names"> & {
  medicines: Array<{ name: string; dose_text?: string; times: string[] }>;
  interests: string[];
  family_names: Record<string, string>;
};

function Field({ label, value, onChange, placeholder, error, keyboard, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; keyboard?: "phone-pad" | "default"; hint?: string }) {
  const { t, radius } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T weight="semi" size={14}>{label}</T>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        keyboardType={keyboard ?? "default"}
        accessibilityLabel={label}
        style={{ backgroundColor: t.surface, borderColor: error ? t.danger : t.border, borderWidth: 1, borderRadius: radius.input, padding: 14, fontSize: 17, color: t.text, fontFamily: "AnekLatin_400Regular" }}
      />
      {error ? <T size={13} color={t.danger}>{error}</T> : hint ? <T size={13} muted>{hint}</T> : null}
    </View>
  );
}

function Pill({ on, children, onPress }: { on?: boolean; children: string; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ borderRadius: 999, borderWidth: 1, borderColor: on ? t.text : t.border, backgroundColor: on ? t.text : t.surface, paddingHorizontal: 16, paddingVertical: 9 }}>
      <T color={on ? t.bg : t.text}>{children}</T>
    </Pressable>
  );
}

let current: AudioPlayer | null = null;
function preview(lang: string, gender: string) {
  try {
    current?.remove();
    current = createAudioPlayer({ uri: `${config.voiceUrl}/tts/sample?lang=${lang}&gender=${gender}` });
    current.play();
  } catch {
    /* previews are a nicety; the flow works without them */
  }
}

export default function AddParent() {
  const { t, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, name: viewerName } = useSession();
  const { refresh } = useFamily();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [d, setD] = useState<Draft>({
    language: "mr", voice_gender: "female", window_start: "09:00", window_end: "10:30", days_of_week: [0, 1, 2, 3, 4, 5, 6],
    call_timezone: "Asia/Kolkata", dialect: "", medicines: [], interests: [], family_names: {}, phone_e164: "+91", name: "", honorific: "", child_name: "",
  });
  const [med, setMed] = useState("");
  const [custom, setCustom] = useState("");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const lang = getLanguage(d.language ?? "mr");
  const who = d.honorific || d.name || "them";

  const next = () => {
    const schema = [parentStep1, parentStep2, parentStep3][step];
    if (schema) {
      const r = schema.safeParse(d);
      if (!r.success) {
        setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
        return;
      }
    }
    setErrors({});
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => s + 1);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const parsed = newParent.parse(d);
      await addParent(parsed, userId, viewerName);
      await refresh(); // so Today shows the new parent immediately
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone(d.window_start ?? "09:00");
      setTimeout(() => router.replace("/(tabs)"), 2200);
    } catch (e) {
      setErrors({ submit: e instanceof Error ? e.message : "Something went wrong. Please try again." });
    }
    setBusy(false);
  };

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
        <Display size={fs(28)} style={{ textAlign: "center" }}>{`First call scheduled for ${done.replace(/^0/, "")} tomorrow.`}</Display>
        <T muted style={{ textAlign: "center" }}>{`We'll tell you as soon as ${who} has agreed to the daily calls.`}</T>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: 20, paddingHorizontal: 20, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 5, now: Math.min(step + 1, 5) }}>
          {STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? t.accent : t.border }} />)}
        </View>
        <T muted size={13}>{`Step ${Math.min(step + 1, 5)} of 5 · ${STEPS[Math.min(step, 4)]}`}</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Display size={fs(26)}>Who are we calling?</Display>
            <Field label="Their name" value={d.name ?? ""} onChange={(v) => set({ name: v })} placeholder="Shobha" error={errors.name} />
            <View style={{ gap: 8 }}>
              <T weight="semi" size={14}>How Sneha should address them</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {lang.honorifics.map((h) => <Pill key={h} on={d.honorific === h} onPress={() => set({ honorific: h })}>{h}</Pill>)}
              </View>
              <Field label="Or type your own" value={d.honorific ?? ""} onChange={(v) => set({ honorific: v })} error={errors.honorific} />
            </View>
            <Field label="Your name, as they know you" value={d.child_name ?? ""} onChange={(v) => set({ child_name: v })} placeholder="Riya" hint="Sneha says the name you enter here on the first call." />
            <Field label="Their phone number" value={d.phone_e164 ?? ""} onChange={(v) => set({ phone_e164: v.replace(/[\s-]/g, "") })} keyboard="phone-pad" error={errors.phone_e164} hint="With the country code, e.g. +91 98765 43210" />
          </>
        )}
        {step === 1 && (
          <>
            <Display size={fs(26)}>Which language do they think in?</Display>
            <T muted>Tap a voice to hear how Sneha will greet them.</T>
            <View style={{ gap: 8 }}>
              {selectableLanguages.map((l) => (
                <Pressable key={l.code} onPress={() => set({ language: l.code, honorific: l.honorifics.includes(d.honorific ?? "") ? d.honorific : undefined })} accessibilityRole="button" accessibilityState={{ selected: d.language === l.code }}>
                  <Row style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: d.language === l.code ? t.text : t.border }}>
                    <View><T weight="bold" size={20}>{l.native_name}</T><T muted size={13}>{l.name}</T></View>
                    {l.status === "preview" ? <Chip>Preview</Chip> : null}
                  </Row>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["female", "male"] as const).map((g) => (
                <Pill key={g} on={d.voice_gender === g} onPress={() => { set({ voice_gender: g }); preview(lang.code, g); }}>{`${g === "female" ? "Female" : "Male"} voice`}</Pill>
              ))}
            </View>
            <Field label="Dialect or region (optional)" value={d.dialect ?? ""} onChange={(v) => set({ dialect: v })} hint="e.g. Pune, Kolhapuri, Konkan" />
          </>
        )}
        {step === 2 && (
          <>
            <Display size={fs(26)}>When is a good time?</Display>
            <T muted>{`Sneha will call ${who} once a day inside this window.`}</T>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}><Field label="Earliest (24h)" value={d.window_start ?? ""} onChange={(v) => set({ window_start: v })} error={errors.window_start} placeholder="09:00" /></View>
              <View style={{ flex: 1 }}><Field label="Latest (24h)" value={d.window_end ?? ""} onChange={(v) => set({ window_end: v })} error={errors.window_end} placeholder="10:30" /></View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DAYS.map((day, i) => <Pill key={day} on={d.days_of_week?.includes(i)} onPress={() => set({ days_of_week: d.days_of_week?.includes(i) ? d.days_of_week.filter((x) => x !== i) : [...(d.days_of_week ?? []), i].sort() })}>{day}</Pill>)}
            </View>
            {errors.days_of_week ? <T size={13} color={t.danger}>{errors.days_of_week}</T> : null}
          </>
        )}
        {step === 3 && (
          <>
            <Display size={fs(26)}>Any medicines to ask about?</Display>
            <T muted>{`Sneha will gently ask whether ${who} has taken them. It never gives medical advice. You can skip this.`}</T>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}><Field label="Medicine" value={med} onChange={setMed} placeholder="BP tablet" /></View>
              <Button title="Add" icon={Plus} variant="secondary" onPress={() => { if (med.trim()) { set({ medicines: [...d.medicines, { name: med.trim(), times: ["morning"] }] }); setMed(""); } }} />
            </View>
            {d.medicines.map((m, i) => (
              <Row key={i} style={{ flexDirection: "row", alignItems: "center" }}>
                <T style={{ flex: 1 }}>{m.name}</T>
                <Pressable accessibilityLabel={`Remove ${m.name}`} onPress={() => set({ medicines: d.medicines.filter((_, j) => j !== i) })}><X size={18} color={t.textMuted} /></Pressable>
              </Row>
            ))}
            <T muted size={13}>A photo of the prescription is for your own reference and is never sent to Sneha&apos;s AI.</T>
          </>
        )}
        {step === 4 && (
          <>
            <Display size={fs(26)}>{`What does ${who} love talking about?`}</Display>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[...SUGGEST, ...d.interests.filter((i) => !SUGGEST.includes(i))].map((i) => (
                <Pill key={i} on={d.interests.includes(i)} onPress={() => set({ interests: d.interests.includes(i) ? d.interests.filter((x) => x !== i) : [...d.interests, i] })}>{i}</Pill>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}><Field label="Something else" value={custom} onChange={setCustom} /></View>
              <Button title="Add" icon={Plus} variant="secondary" onPress={() => { if (custom.trim()) { set({ interests: [...d.interests, custom.trim()] }); setCustom(""); } }} />
            </View>
          </>
        )}
        {step === 5 && (
          <>
            <Display size={fs(26)}>Ready to schedule the first call?</Display>
            <T muted>{`The first call introduces Sneha as an AI assistant set up by you, and asks ${who} for permission. If they say no, calls stop and you'll be told.`}</T>
            {[
              ["Name", `${d.name} (${d.honorific})`], ["Phone", d.phone_e164 ?? ""], ["Language", `${lang.native_name}, ${d.voice_gender} voice`],
              ["Calls", `${d.window_start} to ${d.window_end}, ${d.days_of_week?.length === 7 ? "every day" : d.days_of_week?.map((i) => DAYS[i]).join(", ")}`],
              ["Medicines", d.medicines.length ? d.medicines.map((m) => m.name).join(", ") : "None added"], ["Loves", d.interests.join(", ") || "Not added"],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: "row", gap: 12 }}>
                <T muted style={{ width: 80 }}>{k}</T><T style={{ flex: 1 }}>{v}</T>
              </View>
            ))}
            {errors.submit ? <T color={t.danger} size={14}>{errors.submit}</T> : null}
          </>
        )}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 12, padding: 20, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: t.border }}>
        <View style={{ flex: 1 }}><Button title="Back" variant="ghost" onPress={() => (step === 0 ? goBack() : setStep((s) => s - 1))} /></View>
        <View style={{ flex: 2 }}>
          {step < 5 ? <Button title="Continue" onPress={next} /> : <Button title={busy ? "Scheduling" : "Schedule first call"} disabled={busy} haptic="none" onPress={submit} />}
        </View>
      </View>
    </View>
  );
}
