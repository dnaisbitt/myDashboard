import { daysBetweenKeys, minutesToTime, timeToMinutes } from "./time";

export type WakePlan = {
  thisWeek: string; // "08:15"
  nextWeek: string | null;
  weeksLeft: number;
  done: boolean;
};

/**
 * Becoming a morning person gradually: move the wake time earlier by `step`
 * minutes each week from the start date until the target is reached.
 */
export function wakePlan(current: string, target: string, step: number, startedKey: string, todayKey: string): WakePlan {
  const from = timeToMinutes(current);
  const to = timeToMinutes(target);
  const gap = Math.max(0, from - to);
  const weeks = Math.max(0, Math.floor(daysBetweenKeys(startedKey, todayKey) / 7));
  const shift = Math.min(gap, weeks * step);
  const now = from - shift;
  const done = shift >= gap;
  return {
    thisWeek: minutesToTime(now),
    nextWeek: done ? null : minutesToTime(Math.max(to, now - step)),
    weeksLeft: done ? 0 : Math.ceil((gap - shift) / step),
    done,
  };
}
