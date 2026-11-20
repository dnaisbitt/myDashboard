import { addDaysToKey, daysBetweenKeys, isoWeekday, localToIso } from "./time";
import type { CalendarEvent, EventKind, SessionKind, TimetableSession } from "./types";

/**
 * One thing on the calendar, from a one-off event or the weekly timetable.
 * Timetable occurrences are computed on read, never stored.
 */
export type Block = {
  key: string;
  source: "event" | "session";
  id: string;
  dateKey: string;
  title: string;
  kind: EventKind | SessionKind;
  startsAt: string;
  endsAt: string;
  location: string | null;
  cancelled: boolean;
  event?: CalendarEvent;
  session?: TimetableSession;
};

/** Weekly sessions → dated occurrences between two keys (inclusive). */
export function expandSessions(
  sessions: TimetableSession[],
  exceptions: Array<{ session_id: string; on_date: string }>,
  fromKey: string,
  toKey: string,
  tz: string,
): Block[] {
  const cancelled = new Set(exceptions.map((e) => `${e.session_id}:${e.on_date}`));
  const out: Block[] = [];
  const days = daysBetweenKeys(fromKey, toKey);
  for (let i = 0; i <= days; i++) {
    const key = addDaysToKey(fromKey, i);
    const wd = isoWeekday(key);
    for (const s of sessions) {
      if (s.weekday !== wd || key < s.starts_on || key > s.ends_on) continue;
      out.push({
        key: `s:${s.id}:${key}`,
        source: "session",
        id: s.id,
        dateKey: key,
        title: s.title,
        kind: s.kind,
        startsAt: localToIso(key, s.start_time.slice(0, 5), tz),
        endsAt: localToIso(key, s.end_time.slice(0, 5), tz),
        location: s.location,
        cancelled: cancelled.has(`${s.id}:${key}`),
        session: s,
      });
    }
  }
  return out;
}

export function eventToBlock(e: CalendarEvent, dateKey: string): Block {
  return {
    key: `e:${e.id}`,
    source: "event",
    id: e.id,
    dateKey,
    title: e.title,
    kind: e.kind,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    location: e.location,
    cancelled: false,
    event: e,
  };
}

export function sortBlocks<T extends { startsAt: string; endsAt: string }>(blocks: T[]) {
  return [...blocks].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt));
}

export function blockMinutes(b: { startsAt: string; endsAt: string }) {
  return Math.max(0, Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000));
}

const PHYSICAL = new Set(["training", "match", "gym"]);
export const isPhysical = (kind: string) => PHYSICAL.has(kind);

export type DayLoad = {
  committedMinutes: number;
  focusMinutes: number;
  plannedTaskMinutes: number;
  physical: number;
  level: "light" | "steady" | "heavy" | "overloaded";
  reasons: string[];
};

/**
 * Realistic-day check. Committed = anything with a fixed start (lectures,
 * training, events); focus blocks and planned task estimates add on top.
 * Thresholds are deliberately conservative.
 */
export function dayLoad(blocks: Array<Pick<Block, "kind" | "startsAt" | "endsAt" | "cancelled">>, plannedTaskMinutes = 0): DayLoad {
  let committed = 0;
  let focus = 0;
  let physical = 0;
  for (const b of blocks) {
    if (b.cancelled) continue;
    const m = blockMinutes(b);
    if (b.kind === "focus") focus += m;
    else committed += m;
    if (isPhysical(b.kind)) physical++;
  }
  const total = committed + focus + plannedTaskMinutes;
  const reasons: string[] = [];
  if (total > 10 * 60) reasons.push(`${Math.round(total / 60)}h planned`);
  if (focus > 4 * 60) reasons.push(`${Math.round(focus / 60)}h of focus blocks (more than 4h rarely holds)`);
  if (physical >= 2) reasons.push(`${physical} physical sessions`);
  const level =
    reasons.length >= 2 || total > 11 * 60 ? "overloaded" : reasons.length === 1 ? "heavy" : total > 6 * 60 ? "steady" : "light";
  return { committedMinutes: committed, focusMinutes: focus, plannedTaskMinutes, physical, level, reasons };
}

/** Free gaps (minutes since local midnight) between `from` and `to`. */
export function freeGaps(
  dayBlocks: Array<{ start: number; end: number }>,
  from: number,
  to: number,
  minGap = 30,
): Array<{ from: number; to: number }> {
  const sorted = [...dayBlocks].sort((a, b) => a.start - b.start);
  const gaps: Array<{ from: number; to: number }> = [];
  let cursor = from;
  for (const b of sorted) {
    if (b.end <= cursor) continue;
    if (b.start >= to) break;
    if (b.start - cursor >= minGap) gaps.push({ from: cursor, to: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (to - cursor >= minGap) gaps.push({ from: cursor, to });
  return gaps;
}

/** True when two [start, end) instants overlap. */
export function overlaps(a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);
}

export type ProposedBlock = { date: string; start: string; end: string; title: string };

/**
 * Server-side check for assistant-proposed blocks: inside the allowed date range,
 * valid times, not in the past, and not clashing with anything already scheduled
 * (or with each other). Returns the keepers and the reasons others were dropped.
 */
export function vetProposals<T extends ProposedBlock>(
  proposals: T[],
  existing: Array<Pick<Block, "startsAt" | "endsAt" | "title" | "cancelled">>,
  opts: { fromKey: string; toKey: string; nowMs: number; toIso: (key: string, hhmm: string) => string },
): { keep: Array<T & { startsAt: string; endsAt: string }>; dropped: Array<{ title: string; reason: string }> } {
  const keep: Array<T & { startsAt: string; endsAt: string }> = [];
  const dropped: Array<{ title: string; reason: string }> = [];
  const live = existing.filter((b) => !b.cancelled);
  for (const p of proposals) {
    if (p.date < opts.fromKey || p.date > opts.toKey) {
      dropped.push({ title: p.title, reason: "outside the planning window" });
      continue;
    }
    if (!/^\d{2}:\d{2}$/.test(p.start) || !/^\d{2}:\d{2}$/.test(p.end) || p.end <= p.start) {
      dropped.push({ title: p.title, reason: "invalid times" });
      continue;
    }
    const startsAt = opts.toIso(p.date, p.start);
    const endsAt = opts.toIso(p.date, p.end);
    if (Date.parse(startsAt) < opts.nowMs) {
      dropped.push({ title: p.title, reason: "already in the past" });
      continue;
    }
    const slot = { startsAt, endsAt };
    const clash = live.find((b) => overlaps(slot, b)) ?? keep.find((k) => overlaps(slot, k));
    if (clash) {
      dropped.push({ title: p.title, reason: `clashes with ${clash.title}` });
      continue;
    }
    keep.push({ ...p, startsAt, endsAt });
  }
  return { keep, dropped };
}


export type ImportedItem = ProposedBlock & { kind: string; location: string | null };

/**
 * Checks events read out of a shared message. Invalid, past or out-of-range items
 * are dropped. Clashes are kept but flagged (and start unticked): a clash often
 * means "training moved", which only you can judge.
 */
export function vetImports<T extends ImportedItem>(
  items: T[],
  existing: Array<Pick<Block, "startsAt" | "endsAt" | "title" | "cancelled">>,
  opts: { fromKey: string; toKey: string; nowMs: number; toIso: (key: string, hhmm: string) => string },
): { items: Array<T & { startsAt: string; endsAt: string; clash: string | null }>; dropped: Array<{ title: string; reason: string }> } {
  const out: Array<T & { startsAt: string; endsAt: string; clash: string | null }> = [];
  const dropped: Array<{ title: string; reason: string }> = [];
  const live = existing.filter((b) => !b.cancelled);
  for (const it of items) {
    if (it.date < opts.fromKey || it.date > opts.toKey) {
      dropped.push({ title: it.title, reason: "outside the next three weeks" });
      continue;
    }
    if (!/^\d{2}:\d{2}$/.test(it.start) || !/^\d{2}:\d{2}$/.test(it.end) || it.end <= it.start) {
      dropped.push({ title: it.title, reason: "no clear start and end time" });
      continue;
    }
    const startsAt = opts.toIso(it.date, it.start);
    const endsAt = opts.toIso(it.date, it.end);
    if (Date.parse(endsAt) <= opts.nowMs) {
      dropped.push({ title: it.title, reason: "already over" });
      continue;
    }
    if (out.some((o) => o.startsAt === startsAt && o.endsAt === endsAt && o.title.toLowerCase() === it.title.toLowerCase())) {
      dropped.push({ title: it.title, reason: "listed twice" });
      continue;
    }
    const hit = live.find((b) => overlaps({ startsAt, endsAt }, b));
    out.push({ ...it, startsAt, endsAt, clash: hit ? hit.title : null });
  }
  return { items: out, dropped };
}
