import { addDaysToKey, dateKey, daysBetweenKeys, localMinutes } from "./time";

export type WeekLoadInput = {
  /** Date keys of planned or done physical sessions this week, by type. */
  gym: string[];
  training: string[];
  matches: string[];
  weekStart: string;
};

export type WeekLoad = {
  gym: number;
  training: number;
  matches: number;
  total: number;
  restDays: number;
  level: "easy" | "balanced" | "high" | "too much";
  advice: string;
};

/**
 * The real weekly load before you commit. Korfball (2–4 sessions + matches)
 * already counts; gym goes on top. 4 gym days is the baseline; 5–6 is a bonus
 * only when the week allows (at least one full rest day, not 10+ sessions).
 */
export function weekLoad({ gym, training, matches, weekStart }: WeekLoadInput, gymTarget = 4): WeekLoad {
  const days = new Set([...gym, ...training, ...matches]);
  let restDays = 0;
  for (let i = 0; i < 7; i++) if (!days.has(addDaysToKey(weekStart, i))) restDays++;
  const total = gym.length + training.length + matches.length;
  const korf = training.length + matches.length;
  let level: WeekLoad["level"] = "balanced";
  let advice = `${gym.length} gym + ${korf} korfball. Sustainable.`;
  if (total >= 11 || restDays === 0) {
    level = "too much";
    advice =
      restDays === 0
        ? "No rest day this week. Drop a gym session or make one the 30-minute version."
        : `${total} sessions is a burnout risk. Hold gym at ${gymTarget}.`;
  } else if (total >= 9 || (gym.length > gymTarget && restDays < 2)) {
    level = "high";
    advice = `${total} sessions with ${restDays} rest day${restDays === 1 ? "" : "s"}. Fine as a one-off; don't make it the norm.`;
  } else if (gym.length < gymTarget) {
    level = total <= 3 ? "easy" : "balanced";
    advice = `${gym.length} of ${gymTarget} gym days planned. There's room for ${gymTarget - gym.length} more.`;
  } else if (gym.length > gymTarget) {
    advice = `${gym.length} gym days: a bonus week. Keep one full rest day.`;
  }
  return { gym: gym.length, training: training.length, matches: matches.length, total, restDays, level, advice };
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

export type SleepLog = { night_of: string; bed_at: string | null; wake_at: string | null };

/** Minutes after 18:00 on the night_of evening (23:30 → 330, 01:15 → 435). */
export function bedMinutes(log: SleepLog, tz: string) {
  if (!log.bed_at) return null;
  const local = localMinutes(log.bed_at, tz);
  return dateKey(log.bed_at, tz) === log.night_of ? local - 18 * 60 : local + 6 * 60;
}

export function wakeMinutes(log: SleepLog, tz: string) {
  return log.wake_at ? localMinutes(log.wake_at, tz) : null;
}

export function hoursSlept(log: SleepLog) {
  if (!log.bed_at || !log.wake_at) return null;
  return (Date.parse(log.wake_at) - Date.parse(log.bed_at)) / 3_600_000;
}

/** "minutes after 18:00" → "HH:MM". */
export function bedClock(m: number) {
  const t = (((18 * 60 + m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

type Side = { nights: number; avgWake: number | null; avgTasks: number; focusRate: number | null };
export type ChainInsight = { lateThreshold: string; late: Side; early: Side } | null;

/**
 * The late-night → hard-morning → unproductive-day chain, from your own data.
 * Splits nights at the bedtime threshold and compares the next day's wake time,
 * tasks completed and focus "stayed on it" rate. Needs 3+ nights on each side.
 */
export function sleepChain(
  logs: SleepLog[],
  nextDay: Map<string, { tasksDone: number; focusStayed: number; focusAnswered: number }>,
  tz: string,
  thresholdAfter18 = 6 * 60, // midnight
): ChainInsight {
  const late: SleepLog[] = [];
  const early: SleepLog[] = [];
  for (const l of logs) {
    const b = bedMinutes(l, tz);
    if (b === null) continue;
    (b > thresholdAfter18 ? late : early).push(l);
  }
  if (late.length < 3 || early.length < 3) return null;
  const summarise = (ls: SleepLog[]): Side => {
    const wakes = ls.map((l) => wakeMinutes(l, tz)).filter((x): x is number => x !== null);
    let tasks = 0;
    let stayed = 0;
    let answered = 0;
    for (const l of ls) {
      const d = nextDay.get(addDaysToKey(l.night_of, 1));
      tasks += d?.tasksDone ?? 0;
      stayed += d?.focusStayed ?? 0;
      answered += d?.focusAnswered ?? 0;
    }
    return {
      nights: ls.length,
      avgWake: wakes.length ? Math.round(wakes.reduce((a, b) => a + b, 0) / wakes.length) : null,
      avgTasks: Math.round((tasks / ls.length) * 10) / 10,
      focusRate: answered ? stayed / answered : null,
    };
  };
  return { lateThreshold: bedClock(thresholdAfter18), late: summarise(late), early: summarise(early) };
}

export function daysSince(key: string | null, todayKey: string) {
  return key ? daysBetweenKeys(key, todayKey) : null;
}
