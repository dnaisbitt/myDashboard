import * as chrono from "chrono-node";
import { dateKey, localToIso } from "@/lib/time";

export type ParsedCapture = {
  title: string;
  /** Local date (yyyy-mm-dd) and optional "HH:MM" in the user's zone. */
  due: { key: string; time: string | null } | null;
  matched: string | null;
};

const TRAILING_CONNECTORS = /\s+(on|at|by|for|due|from|this|next)$/i;

/**
 * One line → title + optional due date, e.g. "coursework deadline Friday 5pm".
 * Phase 3 makes tasks only; event detection and smarter parsing come with the Inbox (Phase 4).
 *
 * chrono only supplies the calendar components; the instant is built in the
 * user's zone separately (chrono ignores IANA zone names for BST/GMT).
 */
export function parseCapture(input: string, now: Date, tz: string): ParsedCapture {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return { title: "", due: null, matched: null };

  const result = chrono.en.GB.parse(text, now, { forwardDate: true })[0];
  if (!result) return { title: tidy(text), due: null, matched: null };

  const s = result.start;
  const y = s.get("year");
  const m = s.get("month");
  const d = s.get("day");
  if (!y || !m || !d) return { title: tidy(text), due: null, matched: null };

  const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const hasTime = s.isCertain("hour");
  const time = hasTime ? `${String(s.get("hour") ?? 0).padStart(2, "0")}:${String(s.get("minute") ?? 0).padStart(2, "0")}` : null;

  const without = (text.slice(0, result.index) + " " + text.slice(result.index + result.text.length)).replace(/\s+/g, " ").trim();
  const title = tidy(without.replace(TRAILING_CONNECTORS, "")) || tidy(text);

  // A bare time with no day ("at 14:00") means today.
  const safeKey = key || dateKey(now, tz);
  return { title, due: { key: safeKey, time }, matched: result.text };
}

/** Due instant for storage. Date-only items are due at the end of that local day. */
export function dueToIso(due: { key: string; time: string | null }, tz: string) {
  return localToIso(due.key, due.time ?? "23:59", tz);
}

function tidy(s: string) {
  const t = s.trim().replace(/^[-–,:;\s]+|[-–,:;\s]+$/g, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
