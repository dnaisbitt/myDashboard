"use client";

import Link from "next/link";
import { HabitLogButtons } from "@/components/plans/habit-controls";
import { SectionHeader } from "@/components/ui/misc";
import { habitStats, isScheduled } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/types";

/** Today's habits, one tap each. Weekly habits show progress toward the week's target. */
export function HabitsToday({ habits, logs, todayKey }: { habits: Habit[]; logs: HabitLog[]; todayKey: string }) {
  const due = habits.filter((h) => isScheduled(h, todayKey));
  if (!habits.length) {
    return (
      <section aria-labelledby="habits-title" className="flex flex-col gap-2">
        <SectionHeader id="habits-title" title="Habits" />
        <p className="text-small text-ink-2">
          No habits yet.{" "}
          <Link href="/habits" className="underline underline-offset-4 hover:text-ink">
            Add gym, the phone-down check-in, bedtime…
          </Link>
        </p>
      </section>
    );
  }
  const stats = due.map((h) => ({ h, s: habitStats(h, logs, todayKey) }));
  const logged = stats.filter(({ s }) => s.todayLog).length;
  return (
    <section aria-labelledby="habits-title" className="flex flex-col gap-2">
      <SectionHeader id="habits-title" title="Habits" count={`${logged}/${due.length}`} />
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {stats.map(({ h, s }) => (
          <li key={h.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{h.title}</span>
              <span className="text-micro text-ink-2">
                {s.weekTarget ? `${s.weekDone}/${s.weekTarget} this week` : s.streak ? `${s.streak}-day streak` : h.kind === "check_in" ? "Self-report" : "Today"}
              </span>
            </span>
            <HabitLogButtons habit={h} dateKey={todayKey} status={s.todayLog?.status ?? null} />
          </li>
        ))}
      </ul>
    </section>
  );
}
