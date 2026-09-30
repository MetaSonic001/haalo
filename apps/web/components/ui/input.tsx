import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-input border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted/80 transition-colors duration-150 focus-visible:border-text";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(base, className)} {...p} />,
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...p }, ref) => <select ref={ref} className={cn(base, "appearance-none pr-10", className)} {...p} />,
);
Select.displayName = "Select";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="block text-sm text-danger">{error}</span> : hint ? <span className="block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}
