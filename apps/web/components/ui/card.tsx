import { cn } from "@/lib/utils";

/** Radius carries hierarchy: status card 24, list rows 14. Separation comes from surface contrast, not shadow. */
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card bg-surface p-6", className)} {...p} />;
}
export function Row({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-row bg-surface px-4 py-3", className)} {...p} />;
}
