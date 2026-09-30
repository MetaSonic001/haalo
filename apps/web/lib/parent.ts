import type { FamilyData } from "./data";

/** Which parent the page is about: ?p=<id>, else the first one. */
export function pickParent(fam: FamilyData, p?: string) {
  return fam.parents.find((x) => x.id === p) ?? fam.parents[0] ?? null;
}

export function greeting(name: string, hour = new Date().getHours()) {
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}
