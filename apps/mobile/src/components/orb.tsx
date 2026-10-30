import { BlurMask, Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import { useEffect } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

interface Props {
  size?: number;
  /** live = a call is in progress: rings keep pulsing and follow `level`. */
  live?: boolean;
  /** 0..1 audio amplitude. */
  level?: SharedValue<number>;
  style?: ViewStyle;
  label?: string;
}

const MARIGOLD = "#F3A712";

/**
 * The Sneha orb, drawn with Skia. Welcome: rings expand and fade twice, then it breathes.
 * Live call: rings keep pulsing and react to audio amplitude. Reduce Motion: static.
 */
/** Web fallback: Skia on web needs its WASM engine loaded, which the native app does not. A static View orb keeps `expo start --web` clean. */
function WebOrb({ size = 240, style, label = "The Sneha orb" }: Props) {
  const ring = (k: number, o: number) => ({ position: "absolute" as const, width: size * k, height: size * k, borderRadius: size, borderWidth: 1.5, borderColor: MARIGOLD, opacity: o });
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="image" style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={ring(0.92, 0.25)} />
      <View style={ring(0.76, 0.4)} />
      <View style={{ width: size * 0.54, height: size * 0.54, borderRadius: size, backgroundColor: MARIGOLD, boxShadow: `0 ${size * 0.08}px ${size * 0.2}px rgba(243,167,18,0.55)` } as ViewStyle} />
    </View>
  );
}

export function Orb(props: Props) {
  return Platform.OS === "web" ? <WebOrb {...props} /> : <SkiaOrb {...props} />;
}

function SkiaOrb({ size = 240, live = false, level, style, label = "The Sneha orb" }: Props) {
  const reduce = useReducedMotion();
  const c = size / 2;
  const p0 = useSharedValue(0);
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const settled = useSharedValue(reduce ? 1 : 0);
  const breathe = useSharedValue(0);
  const zero = useSharedValue(0);
  const amp = level ?? zero;

  useEffect(() => {
    if (reduce) {
      settled.value = 1;
      return;
    }
    // NOTE: withRepeat's completion callback runs on the UI runtime, so it must be a worklet and may only touch shared values
    // (calling a plain JS closure from there throws "Tried to synchronously call a remote function").
    const pulse = (v: SharedValue<number>, i: number, repeats: number, settleWhenDone = false) => {
      v.value = 0;
      v.value = withDelay(
        i * 320,
        withRepeat(
          withTiming(1, { duration: live ? 2200 : 1900, easing: Easing.out(Easing.cubic) }),
          repeats,
          false,
          (finished) => {
            "worklet";
            if (finished && settleWhenDone) settled.value = withTiming(1, { duration: 600 });
          },
        ),
      );
    };
    if (live) {
      settled.value = 0;
      [p0, p1, p2].forEach((v, i) => pulse(v, i, -1));
      return;
    }
    pulse(p0, 0, 2);
    pulse(p1, 1, 2);
    pulse(p2, 2, 2, true);
    breathe.value = withDelay(4200, withRepeat(withSequence(withTiming(1, { duration: 2600 }), withTiming(0, { duration: 2600 })), -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, reduce]);

  const rings = [p0, p1, p2].map((p, i) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const r = useDerivedValue(() => {
      const intro = size * (0.3 + 0.34 * p.value);
      const idle = size * (0.34 + 0.06 * i);
      return (intro * (1 - settled.value) + idle * settled.value) * (1 + amp.value * (0.05 + i * 0.05));
    });
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const o = useDerivedValue(() => {
      const intro = 0.7 * (1 - p.value);
      const idle = 0.22 + 0.28 * breathe.value;
      return intro * (1 - settled.value) + idle * settled.value;
    });
    return { r, o };
  });

  const coreR = useDerivedValue(() => size * 0.27 * (1 + breathe.value * 0.03 + amp.value * 0.16));
  const glowR = useDerivedValue(() => coreR.value * 1.3);
  const hl = useDerivedValue(() => vec(c - coreR.value * 0.32, c - coreR.value * 0.44));
  const gradR = useDerivedValue(() => coreR.value * 1.6);

  return (
    <Canvas accessible accessibilityLabel={label} accessibilityRole="image" style={StyleSheet.flatten([{ width: size, height: size }, style])}>
      <Group>
        <Circle cx={c} cy={c} r={glowR} color="rgba(243,167,18,0.45)">
          <BlurMask blur={size * 0.07} style="normal" />
        </Circle>
      </Group>
      {rings.map((ring, i) => (
        <Circle key={i} cx={c} cy={c} r={ring.r} style="stroke" strokeWidth={1.5} color={MARIGOLD} opacity={ring.o} />
      ))}
      <Circle cx={c} cy={c} r={coreR}>
        <RadialGradient c={hl} r={gradR} colors={["#FFE29A", "#F8BE3D", "#F3A712", "#D98A00"]} positions={[0, 0.3, 0.58, 1]} />
      </Circle>
    </Canvas>
  );
}
