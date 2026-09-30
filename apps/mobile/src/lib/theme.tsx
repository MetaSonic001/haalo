import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { themes, radius, type Theme } from "@haalo/ui-tokens";

interface ThemeCtx {
  t: Theme;
  scheme: "light" | "dark";
  radius: typeof radius;
  /** Scale a design font size. Respects system Dynamic Type (via RN) and the in-app large-text mode. */
  fs: (n: number) => number;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = "haalo.largeText";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const scheme = system === "dark" ? "dark" : "light";
  const [largeText, setLarge] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setLarge(v === "1")).catch(() => {});
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      t: themes[scheme],
      scheme,
      radius,
      largeText,
      fs: (n) => Math.round(n * (largeText ? 1.25 : 1)),
      setLargeText: (v) => {
        setLarge(v);
        AsyncStorage.setItem(KEY, v ? "1" : "0").catch(() => {});
      },
    }),
    [scheme, largeText],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
