import { TZDate } from "@date-fns/tz";

/**
 * All date maths happens in the user's profile time zone (default Europe/London),
 * never the server's (Vercel runs in UTC). Safe to import on server and client.
 */
export const DEFAULT_TZ = "Europe/London";
const LOCALE = "en-GB";

function parts(date: Date | number | string, tz: string) {
  const d = typeof date === "string" ? new Date(date) : new Date(date);
  const p = new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** "2026-11-18" in the given zone. */
export function dateKey(date: Date | number | string, tz: string) {
  const { y, m, d } = parts(date, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function localHour(date: Date | number, tz: string) {
  return parts(date, tz).h;
}

/** Minutes since local midnight. */
export function localMinutes(date: Date | number | string, tz: string) {
  const { h, min } = parts(date, tz);
  return h * 60 + min;
}

/** Whole calendar days from key a to key b (b - a). */
export function daysBetweenKeys(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function addDaysToKey(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** UTC instant of local midnight for a date key, as ISO. */
export function startOfLocalDay(key: string, tz: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime()).toISOString();
}

/** Local wall-clock (date key + "HH:MM") → UTC ISO. */
export function localToIso(key: string, hhmm: string, tz: string) {
  const [y, m, d] = key.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, h, min, 0, tz).getTime()).toISOString();
}

export function formatTime(date: Date | number | string, tz: string) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(date),
  );
}

/** "Fri 21 Nov" */
export function formatShortDay(date: Date | number | string, tz: string) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(
    new Date(date),
  );
}

/** { weekday: "Wednesday", day: "18", month: "November" } */
export function longDateParts(date: Date | number, tz: string) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: tz, ...o }).format(date);
  return { weekday: f({ weekday: "long" }), day: f({ day: "numeric" }), month: f({ month: "long" }) };
}

export function greetingFor(hour: number) {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export type DueInfo = { label: string; overdue: boolean; dueToday: boolean; daysAway: number };

/**
 * Direct, factual due labels: "2 days overdue", "today 17:00", "tomorrow", "Fri 17:00 · in 3 days".
 */
export function describeDue(dueIso: string, hasTime: boolean, nowMs: number, tz: string): DueInfo {
  const todayKey = dateKey(nowMs, tz);
  const dueKey = dateKey(dueIso, tz);
  const daysAway = daysBetweenKeys(todayKey, dueKey);
  const time = hasTime ? formatTime(dueIso, tz) : "";
  const dueMs = new Date(dueIso).getTime();

  if (daysAway < 0) {
    const n = -daysAway;
    return { label: `${n} day${n === 1 ? "" : "s"} overdue`, overdue: true, dueToday: false, daysAway };
  }
  if (daysAway === 0) {
    if (hasTime && dueMs < nowMs) return { label: `overdue since ${time}`, overdue: true, dueToday: true, daysAway };
    return { label: hasTime ? `today ${time}` : "today", overdue: false, dueToday: true, daysAway };
  }
  if (daysAway === 1) return { label: hasTime ? `tomorrow ${time}` : "tomorrow", overdue: false, dueToday: false, daysAway };
  const day = daysAway < 7
    ? new Intl.DateTimeFormat(LOCALE, { timeZone: tz, weekday: "short" }).format(new Date(dueIso))
    : formatShortDay(dueIso, tz);
  return {
    label: `${day}${time ? ` ${time}` : ""} · in ${daysAway} days`,
    overdue: false,
    dueToday: false,
    daysAway,
  };
}

export function durationLabel(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Calendar-key helpers (pure: keys are already local dates)
// ---------------------------------------------------------------------------

/** ISO weekday for a date key: Mon = 1 … Sun = 7. */
export function isoWeekday(key: string) {
  const d = new Date(`${key}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the week containing key. */
export function weekStartKey(key: string) {
  return addDaysToKey(key, 1 - isoWeekday(key));
}

export function monthStartKey(key: string) {
  return `${key.slice(0, 7)}-01`;
}

/** Same day n months on, clamped to the month's length (31 Jan + 1 → 28/29 Feb). */
export function addMonthsToKey(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** "09:00:00" | "09:00" → minutes since midnight. */
export function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "Mon 23 Nov" style label from a key (no zone needed). */
export function keyLabel(
  key: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${key}T12:00:00Z`));
}

export function isValidKey(key: string | undefined | null): key is string {
  return Boolean(key && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(`${key}T00:00:00Z`)));
}
