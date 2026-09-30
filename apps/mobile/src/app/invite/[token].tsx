import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Button, Display, Screen, T } from "@/components/ui";
import { acceptInvite } from "@/lib/data";
import { useSession } from "@/lib/session";

export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { ready, session } = useSession();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/sign-in?invite=1");
      return;
    }
    acceptInvite(token).then(() => router.replace("/(tabs)")).catch((e) => setErr(e instanceof Error ? e.message : "This invite didn't work."));
  }, [ready, session, token]);

  return (
    <Screen>
      {err ? (
        <>
          <Display>This invite didn&apos;t work.</Display>
          <T muted style={{ marginVertical: 12 }}>{err}</T>
          <Button title="Go to my app" onPress={() => router.replace("/(tabs)")} />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </Screen>
  );
}
