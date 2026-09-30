import { useSignIn, useSignUp } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Button, Display, Screen, T } from "@/components/ui";
import { config } from "@/lib/config";
import { useTheme } from "@/lib/theme";

WebBrowser.maybeCompleteAuthSession();

/** Clerk errors come back as { error } with a list of { code, longMessage }. */
function describe(e: unknown): { code: string; message: string } {
  const err = e as { errors?: Array<{ code?: string; longMessage?: string; message?: string }>; message?: string; code?: string } | null;
  const first = err?.errors?.[0];
  return { code: first?.code ?? err?.code ?? "", message: first?.longMessage ?? first?.message ?? err?.message ?? "Something went wrong. Please try again." };
}

function ClerkSignIn({ invite }: { invite: boolean }) {
  const { t, radius } = useTheme();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [flow, setFlow] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: radius.input, padding: 14, fontSize: 17, color: t.text, fontFamily: "AnekLatin_400Regular" } as const;

  async function sendCode() {
    setBusy(true);
    setError(null);
    const id = email.trim().toLowerCase();
    try {
      const created = await signIn.create({ identifier: id });
      if (created.error) {
        // No account yet: create one with the same email code.
        if (describe(created.error).code === "form_identifier_not_found") {
          const up = await signUp.create({ emailAddress: id });
          if (up.error) return setError(describe(up.error).message);
          const sent = await signUp.verifications.sendEmailCode();
          if (sent.error) return setError(describe(sent.error).message);
          setFlow("up");
          return setStep("code");
        }
        return setError(describe(created.error).message);
      }
      const sent = await signIn.emailCode.sendCode();
      if (sent.error) return setError(describe(sent.error).message);
      setFlow("in");
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      if (flow === "in") {
        const r = await signIn.emailCode.verifyCode({ code: code.trim() });
        if (r.error) return setError(describe(r.error).message);
        const fin = await signIn.finalize();
        if (fin.error) return setError(describe(fin.error).message);
      } else {
        const r = await signUp.verifications.verifyEmailCode({ code: code.trim() });
        if (r.error) return setError(describe(r.error).message);
        const fin = await signUp.finalize();
        if (fin.error) return setError(describe(fin.error).message);
      }
      router.replace("/(tabs)");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    try {
      const r = await startSSOFlow({ strategy: "oauth_google" });
      if (r.createdSessionId) router.replace("/(tabs)");
    } catch (e) {
      setError(describe(e).message);
    }
  }

  return (
    <Screen>
      <Display>{invite ? "Join your family." : "Welcome."}</Display>
      <T muted style={{ marginTop: 8, marginBottom: 24 }}>
        {step === "email"
          ? invite ? "Sign in first, then open the invite link again." : "Sign in or create your account with your email."
          : `We emailed a 6-digit code to ${email.trim()}.`}
      </T>
      {step === "email" ? (
        <View style={{ gap: 14 }}>
          <T weight="semi" size={14}>Email</T>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={t.textMuted} style={input} accessibilityLabel="Email" />
          {error ? <T size={14} color={t.danger}>{error}</T> : null}
          <Button title="Email me a code" disabled={busy || !email.includes("@")} onPress={sendCode} />
          <Button title="Continue with Google" variant="secondary" onPress={google} />
          {busy ? <ActivityIndicator color={t.text} /> : null}
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <T weight="semi" size={14}>Code</T>
          <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" placeholder="123456" placeholderTextColor={t.textMuted} style={input} accessibilityLabel="Verification code" />
          {error ? <T size={14} color={t.danger}>{error}</T> : null}
          <Button title="Verify and continue" disabled={busy || code.trim().length < 6} onPress={verify} />
          <Button title="Use a different email" variant="ghost" onPress={() => { setStep("email"); setCode(""); setError(null); }} />
          {busy ? <ActivityIndicator color={t.text} /> : null}
        </View>
      )}
    </Screen>
  );
}

export default function SignIn() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();

  if (config.demo) {
    return (
      <Screen>
        <Display>Sign-in isn&apos;t connected yet.</Display>
        <T muted style={{ marginTop: 12, marginBottom: 24 }}>
          Add your Clerk and Supabase keys to .env (see .env.example). Until then, explore the app with demo data.
        </T>
        <Button title="Open the demo" onPress={() => router.replace("/(tabs)")} />
      </Screen>
    );
  }
  return <ClerkSignIn invite={Boolean(invite)} />;
}
