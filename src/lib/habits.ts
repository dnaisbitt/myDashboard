import { addDaysToKey, daysBetweenKeys, isoWeekday, weekStartKey } from "./time";
import type { Habit, HabitLog } from "./types";

/** A log counts toward the habit if it was done, fully or as the minimum version. */
export const counts = (l: HabitLog | undefined) => Boolean(l && (l.status === "done" || l.status === "minimum"));

/** Is the habit scheduled on this date? Weekly habits can happen on any day. */
export function isScheduled(h: Pick<Habit, "frequency" | "weekdays">, key: string) {
  if (h.frequency === "days") return Boolean(h.weekdays?.includes(isoWeekday(key)));
  return true;
}

export type HabitStats = {
  streak: number;
  streakUnit: "day" | "week";
  /** Weekly habits: done this week vs target. */
  weekDone: number;
  weekTarget: number | null;
  /** Share of scheduled days (or weeks) hit over the last 28 days. */
  rate28: number | null;
  todayLog: HabitLog | undefined;
};

/**
 * Streaks never break until a period has fully passed: an unlogged "today"
 * (or an unfinished current week) doesn't reset them.
 */
export function habitStats(habit: Habit, logs: HabitLog[], todayKey: string): HabitStats {
  const byDate = new Map(logs.filter((l) => l.habit_id === habit.id).map((l) => [l.on_date, l]));
  const created = habit.created_at.slice(0, 10);
  const todayLog = byDate.get(todayKey);
  const weekStart = weekStartKey(todayKey);
  let weekDone = 0;
  for (let i = 0; i < 7; i++) if (counts(byDate.get(addDaysToKey(weekStart, i)))) weekDone++;

  if (habit.frequency === "weekly") {
    const target = habit.target_per_week ?? 1;
    const weekCount = (start: string) => {
      let n = 0;
      for (let i = 0; i < 7; i++) if (counts(byDate.get(addDaysToKey(start, i)))) n++;
      return n;
    };
    let streak = weekCount(weekStart) >= target ? 1 : 0;
    let w = addDaysToKey(weekStart, -7);
    while (w >= weekStartKey(created) && weekCount(w) >= target) {
      streak++;
      w = addDaysToKey(w, -7);
    }
    // rate: last 4 complete weeks (or fewer if the habit is newer)
    let hit = 0;
    let total = 0;
    for (let i = 1; i <= 4; i++) {
      const start = addDaysToKey(weekStart, -7 * i);
      if (addDaysToKey(start, 6) < created) break;
      total++;
      if (weekCount(start) >= target) hit++;
    }
    return { streak, streakUnit: "week", weekDone, weekTarget: target, rate28: total ? hit / total : null, todayLog };
  }

  // daily / specific days
  let streak = 0;
  // An unlogged today is still open; an explicit "missed" today ends the streak.
  let k = todayLog ? todayKey : addDaysToKey(todayKey, -1);
  while (k >= created) {
    if (!isScheduled(habit, k)) {
      k = addDaysToKey(k, -1);
      continue;
    }
    if (!counts(byDate.get(k))) break;
    streak++;
    k = addDaysToKey(k, -1);
  }

  let hit = 0;
  let total = 0;
  const span = Math.min(28, daysBetweenKeys(created, todayKey) + 1);
  for (let i = 0; i < span; i++) {
    const day = addDaysToKey(todayKey, -i);
    if (!isScheduled(habit, day)) continue;
    if (day === todayKey && !todayLog) continue; // today isn't over
    total++;
    if (counts(byDate.get(day))) hit++;
  }
  return { streak, streakUnit: "day", weekDone, weekTarget: null, rate28: total ? hit / total : null, todayLog };
}

export function frequencyLabel(h: Pick<Habit, "frequency" | "target_per_week" | "weekdays">) {
  if (h.frequency === "daily") return "Every day";
  if (h.frequency === "weekly") return `${h.target_per_week}× a week`;
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (h.weekdays ?? []).map((d) => names[d]).join(", ");
}
