"use client";

import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
  describedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-150",
        checked ? "border-ink bg-ink" : "border-rule-strong bg-sunken",
        "disabled:opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0.5 size-[18px] rounded-full shadow-sm transition-transform duration-200 ease-out-soft",
          checked ? "translate-x-4 bg-canvas" : "translate-x-0 bg-surface",
        )}
      />
    </button>
  );
}
