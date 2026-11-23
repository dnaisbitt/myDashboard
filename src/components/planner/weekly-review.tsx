"use client";

import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/tabs";
import { bedClock } from "@/lib/body";
import { cn } from "@/lib/cn";
import { formatGBP } from "@/lib/money";
import { addDaysToKey, durationLabel, keyLabel, minutesToTime } from "@/lib/time";
import type { Task } from "@/lib/types";

type Review = {
  weekStart: string;
  weekEnd: string;
  nextStart: string;
  isCurrentWeek: boolean;
  tasks: { planned: number; done: number; slipped: Task[]; completedAll: number };
  priorities: { set: number; done: number };
  focus: { blocks: number; minutes: number; answered: number; stayedRate: number | null };
  habits: Array<{ id: string; title: string; hit: number; due: number }>;
  gym: { done: number; target: number };
  sleep: { nights: number; avgBed: number | null; avgWake: number | null };
  money: { spent: number; allowance: number } | null;
  quietGoals: Array<{ id: string; title: string; quietDays: number }>;
  goalsWithoutSteps: Array<{ id: string; title: string }>;
  next: {
    deadlines: Array<{ id: string; title: string; label: string; task: Task }>;
    days: Array<{ key: string; load: { level: string; committedMinutes: number; focusMinutes: number; reasons: string[] }; fixed: string[]; physical: number }>;
  };
};

function Stat({ label, value, detail, bar }: { label: string; value: string; detail?: string; bar?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-small text-ink-2">{label}</span>
      <span className="font-display text-h2 leading-none">{value}</span>
      {bar !== undefined ? <ProgressBar value={bar} label={label} className="mt-1 max-w-40" /> : null}
      {detail ? <span className="text-micro text-ink-2">{detail}</span> : null}
    </div>
  );
}

/** Five minutes on Sunday: planned vs done, what's been neglected, next week around training and deadlines. */
export function WeeklyReview({ r }: { r: Review }) {
  const { openAssistant, openTask } = useShell();
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const weakHabits = r.habits.filter((h) => h.due && h.hit / h.due < 0.5);

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/planner/review?week=${addDaysToKey(r.weekStart, -7)}`} aria-label="Previous week" className="grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-sunken">
          <ChevronLeft size={18} aria-hidden />
        </Link>
        {!r.isCurrentWeek ? (
          <Link href={`/planner/review?week=${addDaysToKey(r.weekStart, 7)}`} aria-label="Next week" className="grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-sunken">
            <ChevronRight size={18} aria-hidden />
          </Link>
        ) : null}
        <h2 className="font-display text-title">
          Week of {keyLabel(r.weekStart, { day: "numeric", month: "long" })}
        </h2>
        <Button size="sm" className="ml-auto" onClick={openAssistant}>
          <Sparkles size={14} aria-hidden />
          Review with the assistant
        </Button>
      </div>

      <section className="flex flex-col gap-5">
        <SectionHeader title="Planned vs done" />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Planned tasks" value={`${r.tasks.done}/${r.tasks.planned}`} bar={pct(r.tasks.done, r.tasks.planned)} detail={`${r.tasks.completedAll} completed in total`} />
          <Stat label="Today's three" value={`${r.priorities.done}/${r.priorities.set}`} bar={pct(r.priorities.done, r.priorities.set)} />
          <Stat
            label="Focus"
            value={durationLabel(r.focus.minutes)}
            detail={`${r.focus.blocks} block${r.focus.blocks === 1 ? "" : "s"}${r.focus.stayedRate !== null ? ` · stayed on ${Math.round(r.focus.stayedRate * 100)}%` : ""}`}
          />
          <Stat label="Gym" value={`${r.gym.done}/${r.gym.target}`} bar={pct(r.gym.done, r.gym.target)} />
          {r.money ? (
            <Stat
              label="Spent"
              value={formatGBP(r.money.spent, { whole: true })}
              detail={`allowance ${formatGBP(r.money.allowance, { whole: true })}${r.money.spent > r.money.allowance ? " · over" : ""}`}
            />
          ) : (
            <Stat label="Spent" value="–" detail="no term budget set" />
          )}
        </div>
        {r.sleep.nights ? (
          <p className="text-small text-ink-2">
            Sleep: {r.sleep.nights} night{r.sleep.nights === 1 ? "" : "s"} logged, in bed around {r.sleep.avgBed !== null ? bedClock(r.sleep.avgBed) : "–"}, up around{" "}
            {r.sleep.avgWake !== null ? minutesToTime(r.sleep.avgWake) : "–"}.
          </p>
        ) : null}
        {r.tasks.slipped.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-small font-medium">Slipped this week</p>
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {r.tasks.slipped.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openTask(t)} className="flex min-h-10 w-full items-center py-1.5 text-left hover:bg-sunken/40">
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <SectionHeader title="Habits" />
          {r.habits.length ? (
            <ul className="flex flex-col gap-2">
              {r.habits.map((h) => (
                <li key={h.id} className="grid grid-cols-[1fr_120px_48px] items-center gap-3 text-small">
                  <span className="truncate">{h.title}</span>
                  <ProgressBar value={pct(h.hit, h.due)} label={`${h.title} this week`} />
                  <span className="text-right text-ink-2">
                    {h.hit}/{h.due}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-2">No habits set up.</p>
          )}
          {weakHabits.length ? (
            <p className="text-small text-ink-2">
              {weakHabits.map((h) => h.title).join(", ")} slipped. Shrink it (the minimum version) rather than drop it.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <SectionHeader title="Neglected" />
          {r.quietGoals.length || r.goalsWithoutSteps.length ? (
            <ul className="flex flex-col gap-2 text-small">
              {r.quietGoals.map((g) => (
                <li key={g.id}>
                  <Link href={`/goals/${g.id}`} className="font-medium underline-offset-4 hover:underline">
                    {g.title}
                  </Link>{" "}
                  <span className="text-ink-2">hasn&apos;t moved in {g.quietDays} days.</span>
                </li>
              ))}
              {r.goalsWithoutSteps.map((g) => (
                <li key={g.id}>
                  <Link href={`/goals/${g.id}`} className="font-medium underline-offset-4 hover:underline">
                    {g.title}
                  </Link>{" "}
                  <span className="text-ink-2">has no project or habit linked, so nothing daily moves it.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-2">Every active goal moved in the last two weeks.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Next week"
          action={
            <Link href={`/planner?view=week&date=${r.nextStart}`} className="text-small text-ink-2 hover:text-ink">
              Open in Planner
            </Link>
          }
        />
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {r.next.days.map((d) => (
            <li key={d.key} className={cn("flex min-h-24 flex-col gap-1 rounded-sm border p-2", d.load.level === "overloaded" ? "border-danger/60" : "border-rule")}>
              <span className="text-small font-medium">{keyLabel(d.key, { weekday: "short", day: "numeric" })}</span>
              <span className="text-micro text-ink-2">
                {d.physical ? `${d.physical} physical · ` : ""}
                {d.load.level === "overloaded" ? "too much" : d.load.level}
              </span>
              {d.fixed.slice(0, 3).map((f, i) => (
                <span key={i} className="truncate text-micro text-ink-2">
                  {f}
                </span>
              ))}
            </li>
          ))}
        </ol>
        {r.next.deadlines.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-small font-medium">Due next week</p>
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {r.next.deadlines.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => openTask(d.task)} className="flex min-h-10 w-full items-center gap-3 py-1.5 text-left hover:bg-sunken/40">
                    <span className="flex-1">{d.title}</span>
                    <span className="text-small text-ink-2">{d.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-small text-ink-2">Nothing due next week.</p>
        )}
        <p className="text-small text-ink-2">
          Next: use “Plan my week” in the assistant, or drag tasks onto days in the Planner. Fit focus work around training, not on top of it.
        </p>
      </section>
    </div>
  );
}
