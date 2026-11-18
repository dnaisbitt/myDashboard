"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { addStarterHabits } from "@/app/actions/plans";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { Chip } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { counts, frequencyLabel, habitStats, isScheduled } from "@/lib/habits";
import { addDaysToKey, keyLabel, weekStartKey } from "@/lib/time";
import type { Habit, HabitLog } from "@/lib/types";
import { HabitLogButtons } from "./habit-controls";
import { HabitDialog } from "./habit-dialog";

const STARTERS = [
  { key: "gym", label: "Gym, 4× a week", note: "with a 30-minute minimum version" },
  { key: "phone", label: "Phone-down check-in", note: "daily yes/no, evening" },
  { key: "bedtime", label: "In bed on time", note: "daily, evening routine" },
  { key: "wake", label: "Up at my wake time", note: "daily, morning routine" },
] as const;

export function HabitsBoard({
  habits,
  logs,
  goals,
  todayKey,
}: {
  habits: Habit[];
  logs: HabitLog[];
  goals: Array<{ id: string; title: string }>;
  todayKey: string;
}) {
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const active = habits.filter((h) => !h.archived_at);
  const archived = habits.filter((h) => h.archived_at);
  const goalTitle = new Map(goals.map((g) => [g.id, g.title]));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
          <Plus size={14} aria-hidden />
          New habit
        </Button>
      </div>

      {active.length === 0 ? <Starters onCustom={() => setEditing("new")} /> : null}

      {(["morning", "any", "evening"] as const).map((part) => {
        const items = active.filter((h) => h.part_of_day === part);
        if (!items.length) return null;
        return (
          <section key={part} className="flex flex-col gap-1">
            <SectionHeader title={part === "morning" ? "Morning" : part === "evening" ? "Evening" : "Through the day"} count={items.length} />
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {items.map((h) => {
                const s = habitStats(h, logs, todayKey);
                const scheduled = isScheduled(h, todayKey);
                return (
                  <li key={h.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <button type="button" onClick={() => setEditing(h)} className="text-left font-medium hover:underline hover:underline-offset-4">
                        {h.title}
                      </button>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-small text-ink-2">
                        <span>{frequencyLabel(h)}</span>
                        {s.weekTarget ? (
                          <span className={cn(s.weekDone >= s.weekTarget && "text-ink")}>
                            · {s.weekDone}/{s.weekTarget} this week
                          </span>
                        ) : null}
                        {s.streak ? (
                          <span>
                            · {s.streak} {s.streakUnit}
                            {s.streak === 1 ? "" : "s"} streak
                          </span>
                        ) : null}
                        {s.rate28 !== null ? <span>· {Math.round(s.rate28 * 100)}% last 4 weeks</span> : null}
                        {h.goal_id && goalTitle.get(h.goal_id) ? <Chip>{goalTitle.get(h.goal_id)}</Chip> : null}
                        {h.kind === "check_in" ? <Chip tone="muted">Self-report</Chip> : null}
                      </p>
                      <History habit={h} logs={logs} todayKey={todayKey} />
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {scheduled ? (
                        <HabitLogButtons habit={h} dateKey={todayKey} status={s.todayLog?.status ?? null} />
                      ) : (
                        <span className="text-small text-ink-3">Not scheduled today</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {archived.length ? (
        <section className="flex flex-col gap-1">
          <SectionHeader title="Archived" count={archived.length} />
          <ul className="flex flex-col">
            {archived.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => setEditing(h)} className="py-1.5 text-small text-ink-2 hover:text-ink">
                  {h.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HabitDialog open={editing !== null} onClose={() => setEditing(null)} habit={editing && editing !== "new" ? editing : undefined} goals={goals} />
    </div>
  );
}

/** 12 weeks, Monday-first columns. Filled = done, half = minimum, ring = honest no. */
function History({ habit, logs, todayKey }: { habit: Habit; logs: HabitLog[]; todayKey: string }) {
  const byDate = new Map(logs.filter((l) => l.habit_id === habit.id).map((l) => [l.on_date, l]));
  const start = addDaysToKey(weekStartKey(todayKey), -7 * 11);
  const created = habit.created_at.slice(0, 10);
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysToKey(start, w * 7 + d)));
  const done = [...byDate.values()].filter((l) => counts(l)).length;

  return (
    <div className="mt-3 flex items-end gap-3">
      <div className="flex gap-[3px]" role="img" aria-label={`${habit.title}: last 12 weeks, ${done} days logged as done`}>
        {weeks.map((days, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {days.map((k) => {
              const l = byDate.get(k);
              const future = k > todayKey;
              const before = k < created;
              const off = !isScheduled(habit, k);
              return (
                <span
                  key={k}
                  title={`${keyLabel(k)}${l ? `: ${l.status}` : ""}`}
                  className={cn(
                    "size-[9px] rounded-[2px]",
                    future || before
                      ? "bg-transparent"
                      : l?.status === "done"
                        ? "bg-ink"
                        : l?.status === "minimum"
                          ? "bg-ink/45"
                          : l?.status === "missed"
                            ? "shadow-[inset_0_0_0_1px_var(--ink-3)]"
                            : off
                              ? "bg-sunken/50"
                              : "bg-sunken",
                    k === todayKey && "outline outline-1 outline-offset-1 outline-ink-3",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Starters({ onCustom }: { onCustom: () => void }) {
  const [chosen, setChosen] = useState<string[]>(["gym", "phone"]);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  return (
    <EmptyState
      title="No habits yet"
      body="These four come from your plan. Pick any to add them; you can edit or delete them after."
      action={
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5">
            {STARTERS.map((s) => (
              <li key={s.key}>
                <label className="flex cursor-pointer items-center gap-2.5 text-small">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--ink)]"
                    checked={chosen.includes(s.key)}
                    onChange={(e) => setChosen(e.target.checked ? [...chosen, s.key] : chosen.filter((c) => c !== s.key))}
                  />
                  <span className="font-medium">{s.label}</span>
                  <span className="text-ink-2">{s.note}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              pending={pending}
              disabled={!chosen.length}
              onClick={() =>
                start(async () => {
                  const r = await addStarterHabits(chosen);
                  notify(r.ok ? `Added ${r.data!.added} habit${r.data!.added === 1 ? "" : "s"}` : r.error, { tone: r.ok ? "ok" : "error" });
                })
              }
            >
              Add these
            </Button>
            <Button size="sm" variant="ghost" onClick={onCustom}>
              Write my own
            </Button>
          </div>
        </div>
      }
    />
  );
}
