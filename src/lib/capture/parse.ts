import * as chrono from "chrono-node";
import { dateKey, localToIso } from "../time";

export type CaptureKind = "task" | "event";

export type ParsedCapture = {
  kind: CaptureKind;
  title: string;
  /** Local date (yyyy-mm-dd) and optional "HH:MM" in the user's zone. */
  due: { key: string; time: string | null } | null;
  /** Events only: end time "HH:MM" (explicit range, or start + 1h). */
  end: string | null;
  category: string | null;
  matched: string | null;
};

const TRAILING_CONNECTORS = /\s+(on|at|by|for|due|from|this|next)$/i;
const DEADLINE_WORDS = /\b(due|deadline|submit|submission|hand[- ]?in|by|before|pay|renew|return|apply|register|book)\b/i;
const EVENT_WORDS =
  /\b(meet|meeting|call with|dentist|doctor|gp|appointment|appt|lecture|seminar|tutorial|lab|training|match|game|social|party|dinner|lunch with|drinks|coffee with|interview|exam|viewing|haircut|trip|train to|flight)\b/i;
const SHOPPING = /^(buy|get|pick up|order|grab)\s+/i;

/**
 * One line → a task or an event.
 *   "coursework deadline Friday 5pm" → task due Fri 17:00
 *   "dentist tue 3pm"                → event Tue 15:00–16:00
 *   "buy oats"                       → task, category Shopping, Inbox
 * Events need a specific time plus either an event word or a time range.
 *
 * chrono supplies calendar components only; the instant is built in the user's
 * zone separately (chrono ignores IANA zone names, so BST would be off by an hour).
 */
export function parseCapture(input: string, now: Date, tz: string): ParsedCapture {
  const text = input.trim().replace(/\s+/g, " ");
  const category = SHOPPING.test(text) ? "Shopping" : null;
  const empty: ParsedCapture = { kind: "task", title: "", due: null, end: null, category, matched: null };
  if (!text) return empty;

  const result = chrono.en.GB.parse(text, now, { forwardDate: true })[0];
  if (!result) return { ...empty, title: tidy(text) };

  const s = result.start;
  const y = s.get("year");
  const m = s.get("month");
  const d = s.get("day");
  if (!y || !m || !d) return { ...empty, title: tidy(text) };

  const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const hasTime = s.isCertain("hour");
  const hhmm = (h: number | null, min: number | null) =>
    `${String(h ?? 0).padStart(2, "0")}:${String(min ?? 0).padStart(2, "0")}`;
  const time = hasTime ? hhmm(s.get("hour"), s.get("minute")) : null;

  const without = (text.slice(0, result.index) + " " + text.slice(result.index + result.text.length)).replace(/\s+/g, " ").trim();
  const title = tidy(without.replace(TRAILING_CONNECTORS, "")) || tidy(text);

  const hasRange = Boolean(result.end && result.end.isCertain("hour"));
  const isEvent = Boolean(time) && !DEADLINE_WORDS.test(text) && (hasRange || EVENT_WORDS.test(text));

  let end: string | null = null;
  if (isEvent && time) {
    if (hasRange) end = hhmm(result.end!.get("hour"), result.end!.get("minute"));
    else {
      const [h, mm] = time.split(":").map(Number);
      end = hhmm(Math.min(23, h + 1), h + 1 > 23 ? 59 : mm);
    }
    if (end <= time) end = null;
  }

  return {
    kind: isEvent && end ? "event" : "task",
    title,
    due: { key: key || dateKey(now, tz), time },
    end: isEvent ? end : null,
    category,
    matched: result.text,
  };
}

/** Due instant for storage. Date-only items are due at the end of that local day. */
export function dueToIso(due: { key: string; time: string | null }, tz: string) {
  return localToIso(due.key, due.time ?? "23:59", tz);
}

function tidy(s: string) {
  const t = s.trim().replace(/^[-–,:;\s]+|[-–,:;\s]+$/g, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
