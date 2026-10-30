import { router } from "expo-router";
import { View } from "react-native";
import { PRODUCT } from "@haalo/shared";
import { Orb } from "@/components/orb";
import { Button, Display, Screen, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

/** Welcome: the orb rings once (twice, as on the web), then the headline. */
export default function Welcome() {
  const { fs } = useTheme();
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View style={{ alignItems: "center", paddingTop: 24 }}>
          <Orb size={300} />
        </View>
        <View style={{ gap: 12 }}>
          <Display size={fs(34)}>{PRODUCT.tagline}</Display>
          <T muted size={17}>
            Heartline phones your parents every morning in their own language, and tells you how they are.
          </T>
        </View>
        <View style={{ gap: 12 }}>
          <Button title="Get started" haptic="success" onPress={() => router.push("/sign-in")} />
          <Button title="I have an invite" variant="secondary" onPress={() => router.push("/sign-in?invite=1")} />
        </View>
      </View>
    </Screen>
  );
}
