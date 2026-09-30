import { createContext, useContext, useMemo, useState } from "react";
import type { Flag } from "@haalo/db";
import { loadFamily, loadFlags, type FamilyData } from "./data";
import { useSession } from "./session";
import { useCached } from "./use-cached";

interface FamilyCtx {
  family: FamilyData | null;
  loading: boolean;
  stale: boolean;
  parent: FamilyData["parents"][number] | null;
  setParentId: (id: string) => void;
  flags: Flag[];
  openFlags: number;
  refresh: () => Promise<void>;
}
const Ctx = createContext<FamilyCtx | null>(null);

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useSession();
  const fam = useCached<FamilyData>(
    `family:${userId || "anon"}`,
    // Not signed in yet (welcome / sign-in screens): nothing to load.
    () => (userId ? loadFamily(userId) : Promise.resolve({ familyId: null, parents: [], members: [] })),
    [userId],
  );
  const ids = fam.data?.parents.map((p) => p.id) ?? [];
  const flags = useCached<Flag[]>(`flags:${userId || "anon"}`, () => (userId ? loadFlags(ids) : Promise.resolve([])), [userId, ids.join(",")]);
  const [selected, setSelected] = useState<string | null>(null);

  const value = useMemo<FamilyCtx>(() => {
    const parents = fam.data?.parents ?? [];
    return {
      family: fam.data,
      loading: fam.loading,
      stale: fam.stale,
      parent: parents.find((p) => p.id === selected) ?? parents[0] ?? null,
      setParentId: setSelected,
      flags: flags.data ?? [],
      openFlags: (flags.data ?? []).filter((f) => f.status === "open").length,
      refresh: async () => {
        await fam.refresh();
        await flags.refresh();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fam.data, fam.loading, fam.stale, flags.data, selected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFamily outside FamilyProvider");
  return v;
}
