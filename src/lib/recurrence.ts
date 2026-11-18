import { addDaysToKey, addMonthsToKey, isoWeekday } from "./time";
import type { Recurrence } from "./types";

/** Next occurrence date key strictly after `fromKey`. */
export function nextOccurrence(rule: Recurrence, fromKey: string): string {
  const interval = Math.max(1, Math.min(12, rule.interval || 1));
  if (rule.freq === "daily") return addDaysToKey(fromKey, interval);
  if (rule.freq === "monthly") return addMonthsToKey(fromKey, interval);

  const days = (rule.weekdays?.length ? [...rule.weekdays] : [isoWeekday(fromKey)]).sort((a, b) => a - b);
  const wd = isoWeekday(fromKey);
  const laterThisWeek = days.find((d) => d > wd);
  if (laterThisWeek) return addDaysToKey(fromKey, laterThisWeek - wd);
  // First chosen weekday, `interval` weeks on.
  return addDaysToKey(fromKey, 7 * interval - (wd - days[0]));
}

const WD = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function describeRecurrence(rule: Recurrence | null): string | null {
  if (!rule) return null;
  const n = rule.interval || 1;
  if (rule.freq === "daily") return n === 1 ? "Every day" : `Every ${n} days`;
  if (rule.freq === "monthly") return n === 1 ? "Every month" : `Every ${n} months`;
  const base = n === 1 ? "Every week" : `Every ${n} weeks`;
  return rule.weekdays?.length ? `${base} on ${rule.weekdays.map((d) => WD[d]).join(", ")}` : base;
}
