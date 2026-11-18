"use client";

import { cn } from "@/lib/cn";

/** Task completion control. The tick draws itself on check: motion answers the action. */
export function TaskCheck({
  checked,
  onChange,
  label,
  disabled,
  tone = "default",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        // 18px visual box inside a 32px hit area for touch
        "relative grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px]",
        "before:absolute before:-inset-[7px] before:content-['']",
        "transition-[background-color,border-color,transform] duration-150 active:scale-90",
        checked
          ? "border-ink bg-ink text-canvas"
          : tone === "danger"
            ? "border-danger/70 hover:border-danger"
            : "border-rule-strong hover:border-ink-2",
        "disabled:opacity-50",
      )}
    >
      <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
        <path
          d="M2.5 6.2 4.9 8.5 9.5 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className={cn(
            "transition-[stroke-dashoffset] duration-200 ease-out",
            checked ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:1]",
          )}
        />
      </svg>
    </button>
  );
}
