"use client";

import { useOptimistic, useTransition } from "react";
import { logHabit } from "@/app/actions/plans";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Habit, HabitLog } from "@/lib/types";

type Status = HabitLog["status"] | null;

/**
 * One-tap logging. Build habits: Done, or the minimum version (still counts).
 * Check-ins are an honest yes/no self-report. Tapping the active choice clears it.
 */
export function HabitLogButtons({
  habit,
  dateKey,
  status,
  size = "md",
}: {
  habit: Habit;
  dateKey: string;
  status: Status;
  size?: "md" | "lg";
}) {
  const [optimistic, setOptimistic] = useOptimistic<Status>(status);
  const [, start] = useTransition();
  const { notify } = useToast();

  const set = (next: Status) =>
    start(async () => {
      setOptimistic(next);
      const r = await logHabit(habit.id, dateKey, next);
      if (!r.ok) notify(r.error, { tone: "error" });
    });

  const btn = (value: Exclude<Status, null>, label: string, aria: string) => {
    const active = optimistic === value;
    return (
      <button
        type="button"
        aria-pressed={active}
        aria-label={aria}
        onClick={() => set(active ? null : value)}
        className={cn(
          "rounded-sm border font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95",
          size === "lg" ? "h-10 px-4 text-body" : "h-8 px-3 text-small",
          active
            ? value === "missed"
              ? "border-ink-2 bg-sunken text-ink"
              : "border-ink bg-ink text-canvas"
            : "border-rule text-ink-2 hover:border-rule-strong hover:text-ink",
        )}
      >
        {label}
      </button>
    );
  };

  if (habit.kind === "check_in") {
    return (
      <div className="flex gap-1.5" role="group" aria-label={`${habit.title}, today`}>
        {btn("done", "Yes", `${habit.title}: yes, kept to it`)}
        {btn("missed", "No", `${habit.title}: no, not today`)}
      </div>
    );
  }
  return (
    <div className="flex gap-1.5" role="group" aria-label={`${habit.title}, today`}>
      {habit.minimum_version ? btn("minimum", "Minimum", `${habit.title}: did the minimum version`) : null}
      {btn("done", "Done", `${habit.title}: done`)}
    </div>
  );
}
