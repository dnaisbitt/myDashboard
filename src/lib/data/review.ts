import "server-only";
import { bedMinutes, wakeMinutes, type SleepLog } from "@/lib/body";
import { counts, isScheduled } from "@/lib/habits";
import { computeBudget } from "@/lib/money";
import { blockMinutes, dayLoad } from "@/lib/schedule";
import { addDaysToKey, describeDue, startOfLocalDay } from "@/lib/time";
import { TASK_COLUMNS, type Task } from "@/lib/types";
import { getMoney } from "./life";
import { getRange } from "./planner";
import { getGoals, getHabits } from "./plans";
import { getClock, getViewer } from "./viewer";

/**
 * The Sunday review: this week planned vs done, what's been neglected,
 * and next week around training and deadlines. Read-only.
 */
export async function getWeeklyReview(weekStart: string) {
  const { supabase } = await getViewer();
  const { tz, todayKey, nowMs, profile } = await getClock();
  const weekEnd = addDaysToKey(weekStart, 6);
  const nextStart = addDaysToKey(weekStart, 7);
  const nextEnd = addDaysToKey(weekStart, 13);
  const startIso = startOfLocalDay(weekStart, tz);
  const endIso = startOfLocalDay(nextStart, tz);

  const [thisWeek, nextWeek, habits, goals, money, tasks, done, workouts, sleep] = await Promise.all([
    getRange(weekStart, weekEnd),
    getRange(nextStart, nextEnd),
    getHabits(),
    getGoals(),
    getMoney(),
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .is("parent_id", null)
      .neq("status", "archived")
      .or(`and(due_at.gte.${startIso},due_at.lt.${endIso}),and(planned_on.gte.${weekStart},planned_on.lte.${weekEnd}),and(today_date.gte.${weekStart},today_date.lte.${weekEnd})`),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").is("parent_id", null).gte("completed_at", startIso).lt("completed_at", endIso),
    supabase.from("workouts").select("on_date,kind").gte("on_date", weekStart).lte("on_date", weekEnd),
    supabase.from("sleep_logs").select("night_of,bed_at,wake_at").gte("night_of", addDaysToKey(weekStart, -1)).lte("night_of", addDaysToKey(weekEnd, -1)),
  ]);
  const err = tasks.error ?? done.error ?? workouts.error ?? sleep.error;
  if (err) throw new Error(`Could not load the review: ${err.message}`);

  const weekTasks = (tasks.data ?? []) as Task[];
  const planned = weekTasks.length;
  const plannedDone = weekTasks.filter((t) => t.status === "done").length;
  const slipped = weekTasks.filter((t) => t.status !== "done");
  const priorities = weekTasks.filter((t) => t.today_rank);

  const focus = thisWeek.blocks.filter((b) => b.kind === "focus" && b.event);
  const answered = focus.filter((b) => b.event!.outcome);
  const stayed = answered.reduce((s, b) => s + (b.event!.outcome === "stayed" ? 1 : b.event!.outcome === "partly" ? 0.5 : 0), 0);

  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i)).filter((k) => k <= todayKey);
  const habitRows = habits.habits.map((h) => {
    const due = h.frequency === "weekly" ? (h.target_per_week ?? 1) : days.filter((k) => isScheduled(h, k)).length;
    const hit = habits.logs.filter((l) => l.habit_id === h.id && l.on_date >= weekStart && l.on_date <= weekEnd && counts(l)).length;
    return { id: h.id, title: h.title, hit, due };
  });

  const sleepLogs = (sleep.data ?? []) as SleepLog[];
  const avg = (xs: Array<number | null>) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };

  const budget = money.period ? computeBudget(money.period, money.items, money.txns, todayKey) : null;
  const spentThisWeek = money.txns.filter((t) => t.occurred_on >= weekStart && t.occurred_on <= weekEnd).reduce((s, t) => s + t.amount_pence, 0);

  const nextDeadlines = (
    await supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .in("status", ["open", "inbox"])
      .is("parent_id", null)
      .gte("due_at", startOfLocalDay(nextStart, tz))
      .lt("due_at", startOfLocalDay(addDaysToKey(nextEnd, 1), tz))
      .order("due_at")
  ).data as Task[] | null;

  const nextDays = Array.from({ length: 7 }, (_, i) => {
    const k = addDaysToKey(nextStart, i);
    const blocks = nextWeek.blocks.filter((b) => b.dateKey === k);
    return {
      key: k,
      load: dayLoad(blocks),
      fixed: blocks.filter((b) => !b.cancelled && b.kind !== "focus").map((b) => b.title),
      physical: blocks.filter((b) => !b.cancelled && ["training", "match", "gym"].includes(b.kind)).length,
    };
  });

  return {
    tz,
    nowMs,
    weekStart,
    weekEnd,
    nextStart,
    isCurrentWeek: todayKey >= weekStart && todayKey <= weekEnd,
    tasks: { planned, done: plannedDone, slipped: slipped.slice(0, 8), completedAll: done.count ?? 0 },
    priorities: { set: priorities.length, done: priorities.filter((t) => t.status === "done").length },
    focus: { blocks: focus.length, minutes: focus.reduce((s, b) => s + blockMinutes(b), 0), answered: answered.length, stayedRate: answered.length ? stayed / answered.length : null },
    habits: habitRows,
    gym: { done: (workouts.data ?? []).length, target: profile.gym_target_per_week },
    sleep: {
      nights: sleepLogs.length,
      avgBed: avg(sleepLogs.map((l) => bedMinutes(l, tz))),
      avgWake: avg(sleepLogs.map((l) => wakeMinutes(l, tz))),
    },
    money: budget ? { spent: spentThisWeek, allowance: budget.allowancePerWeek } : null,
    quietGoals: goals.filter((g) => g.status === "active" && g.quietDays >= 14).map((g) => ({ id: g.id, title: g.title, quietDays: g.quietDays })),
    goalsWithoutSteps: goals.filter((g) => g.status === "active" && g.projects.length === 0 && g.habits.length === 0).map((g) => ({ id: g.id, title: g.title })),
    next: {
      deadlines: (nextDeadlines ?? []).map((t) => ({ id: t.id, title: t.title, label: describeDue(t.due_at!, t.due_has_time, nowMs, tz).label, task: t })),
      days: nextDays,
    },
    todayKey,
  };
}
