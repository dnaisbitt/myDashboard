// Unit tests for pure logic: capture parsing, recurrence, timetable expansion,
// load checks, habit streaks, timezone handling. Run: npm run test:logic
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCapture, dueToIso } from "../src/lib/capture/parse";
import { describeRecurrence, nextOccurrence } from "../src/lib/recurrence";
import { dayLoad, expandSessions, freeGaps } from "../src/lib/schedule";
import { habitStats } from "../src/lib/habits";
import { addMonthsToKey, describeDue, isoWeekday, localToIso, weekStartKey } from "../src/lib/time";
import type { Habit, HabitLog, TimetableSession } from "../src/lib/types";

const TZ = "Europe/London";
const WED = new Date("2026-11-18T09:00:00Z"); // Wednesday, GMT

test("capture: deadline becomes a task with a due time", () => {
  const p = parseCapture("coursework deadline Friday 5pm", WED, TZ);
  assert.equal(p.kind, "task");
  assert.equal(p.title, "Coursework deadline");
  assert.deepEqual(p.due, { key: "2026-11-20", time: "17:00" });
  assert.equal(dueToIso(p.due!, TZ), "2026-11-20T17:00:00.000Z");
});

test("capture: appointment with a time becomes an event, 1h default", () => {
  const p = parseCapture("dentist tue 3pm", WED, TZ);
  assert.equal(p.kind, "event");
  assert.equal(p.title, "Dentist");
  assert.deepEqual(p.due, { key: "2026-11-24", time: "15:00" });
  assert.equal(p.end, "16:00");
});

test("capture: explicit time range becomes an event", () => {
  const p = parseCapture("revision with Tom thursday 2-4pm", WED, TZ);
  assert.equal(p.kind, "event");
  assert.equal(p.due?.time, "14:00");
  assert.equal(p.end, "16:00");
});

test("capture: deadline words win over event words", () => {
  assert.equal(parseCapture("submit lab report friday 5pm", WED, TZ).kind, "task");
});

test("capture: no date goes to inbox; shopping is tagged", () => {
  const p = parseCapture("buy oats", WED, TZ);
  assert.equal(p.due, null);
  assert.equal(p.category, "Shopping");
});

test("capture: BST is handled in the user's zone", () => {
  const june = new Date("2026-06-17T09:00:00Z");
  const p = parseCapture("essay due friday 5pm", june, TZ);
  assert.equal(dueToIso(p.due!, TZ), "2026-06-19T16:00:00.000Z");
});

test("recurrence: weekly on chosen days", () => {
  const rule = { freq: "weekly" as const, interval: 1, weekdays: [1, 3] };
  assert.equal(nextOccurrence(rule, "2026-11-16"), "2026-11-18"); // Mon → Wed
  assert.equal(nextOccurrence(rule, "2026-11-18"), "2026-11-23"); // Wed → next Mon
  assert.equal(nextOccurrence({ freq: "weekly", interval: 2, weekdays: [1] }, "2026-11-16"), "2026-11-30");
  assert.equal(describeRecurrence(rule), "Every week on Mon, Wed");
});

test("recurrence: daily and monthly (clamped)", () => {
  assert.equal(nextOccurrence({ freq: "daily", interval: 2 }, "2026-11-30"), "2026-12-02");
  assert.equal(nextOccurrence({ freq: "monthly", interval: 1 }, "2027-01-31"), "2027-02-28");
  assert.equal(addMonthsToKey("2028-01-31", 1), "2028-02-29");
});

test("time: ISO weekdays and week start", () => {
  assert.equal(isoWeekday("2026-11-18"), 3);
  assert.equal(isoWeekday("2026-11-22"), 7);
  assert.equal(weekStartKey("2026-11-22"), "2026-11-16");
});

test("time: due labels are direct", () => {
  const now = Date.parse("2026-11-18T09:00:00Z");
  assert.equal(describeDue("2026-11-21T17:00:00Z", true, now, TZ).label, "Sat 17:00 · in 3 days");
  assert.equal(describeDue("2026-11-17T23:59:00Z", false, now, TZ).label, "1 day overdue");
  assert.equal(describeDue("2026-11-18T08:00:00Z", true, now, TZ).label, "overdue since 08:00");
});

const session = (over: Partial<TimetableSession> = {}): TimetableSession => ({
  id: "s1",
  title: "ML lecture",
  kind: "lecture",
  weekday: 3,
  start_time: "09:00:00",
  end_time: "11:00:00",
  location: null,
  starts_on: "2026-09-28",
  ends_on: "2026-12-11",
  ...over,
});

test("timetable: expands weekly, respects term dates, exceptions and BST", () => {
  const blocks = expandSessions([session()], [{ session_id: "s1", on_date: "2026-11-25" }], "2026-11-16", "2026-11-29", TZ);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].startsAt, "2026-11-18T09:00:00.000Z");
  assert.equal(blocks[0].cancelled, false);
  assert.equal(blocks[1].cancelled, true);
  const summer = expandSessions([session({ starts_on: "2026-06-01", ends_on: "2026-06-30" })], [], "2026-06-15", "2026-06-21", TZ);
  assert.equal(summer[0].startsAt, "2026-06-17T08:00:00.000Z");
  assert.equal(expandSessions([session()], [], "2026-12-14", "2026-12-20", TZ).length, 0, "after term ends");
});

test("load: flags overloaded days, ignores cancelled sessions", () => {
  const at = (h: number) => localToIso("2026-11-18", `${String(h).padStart(2, "0")}:00`, TZ);
  const b = (kind: string, s: number, e: number, cancelled = false) => ({ kind: kind as never, startsAt: at(s), endsAt: at(e), cancelled });
  assert.equal(dayLoad([b("lecture", 9, 11)]).level, "light");
  const heavy = dayLoad([b("lecture", 9, 12), b("focus", 13, 18), b("training", 19, 21), b("gym", 7, 8)]);
  assert.equal(heavy.level, "overloaded");
  assert.ok(heavy.reasons.some((r) => r.includes("physical")));
  assert.equal(dayLoad([b("training", 19, 21, true), b("gym", 7, 8)]).physical, 1);
});

test("gaps: finds free windows", () => {
  const gaps = freeGaps([{ start: 9 * 60, end: 11 * 60 }, { start: 14 * 60, end: 15 * 60 }], 8 * 60, 18 * 60, 45);
  assert.deepEqual(gaps, [
    { from: 480, to: 540 },
    { from: 660, to: 840 },
    { from: 900, to: 1080 },
  ]);
});

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  title: "Phone down",
  kind: "check_in",
  frequency: "daily",
  target_per_week: null,
  weekdays: null,
  part_of_day: "evening",
  minimum_version: null,
  goal_id: null,
  position: 0,
  archived_at: null,
  created_at: "2026-11-01T10:00:00Z",
  ...over,
});
const log = (on_date: string, status: HabitLog["status"] = "done"): HabitLog => ({ habit_id: "h1", on_date, status });

test("habits: daily streak survives an unlogged today, breaks on a miss", () => {
  const logs = [log("2026-11-15"), log("2026-11-16"), log("2026-11-17")];
  assert.equal(habitStats(habit(), logs, "2026-11-18").streak, 3);
  assert.equal(habitStats(habit(), [...logs, log("2026-11-18", "missed")], "2026-11-18").streak, 0);
  assert.equal(habitStats(habit(), [...logs, log("2026-11-18", "minimum")], "2026-11-18").streak, 4);
});

test("habits: specific weekdays skip unscheduled days", () => {
  const h = habit({ frequency: "days", weekdays: [1, 3, 5] });
  const logs = [log("2026-11-13"), log("2026-11-16")]; // Fri, Mon
  assert.equal(habitStats(h, logs, "2026-11-18").streak, 2); // Wed not logged yet
});

test("habits: weekly target streak counts whole weeks", () => {
  const h = habit({ frequency: "weekly", target_per_week: 2, kind: "build", title: "Gym" });
  const logs = [log("2026-11-03"), log("2026-11-05"), log("2026-11-10"), log("2026-11-12"), log("2026-11-16")];
  const s = habitStats(h, logs, "2026-11-18");
  assert.equal(s.streak, 2);
  assert.equal(s.weekDone, 1);
  assert.equal(s.weekTarget, 2);
});

import { parseIcs } from "../src/lib/ics";

test("ics: weekly lecture with TZID, EXDATE and UNTIL expands in local time", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "SUMMARY:Machine Learning\, lecture",
    "LOCATION:Brockington U.0.05",
    "DTSTART;TZID=Europe/London:20261007T090000",
    "DTEND;TZID=Europe/London:20261007T110000",
    "RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261202T235959Z",
    "EXDATE;TZID=Europe/London:20261104T090000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:All-day thing",
    "DTSTART;VALUE=DATE:20261010",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const { events, skipped } = parseIcs(ics, { tz: "Europe/London", fromKey: "2026-10-01", toKey: "2026-12-31" });
  assert.equal(skipped, 1, "all-day skipped");
  assert.equal(events.length, 8, "9 Wednesdays Oct 7 – Dec 2, minus one EXDATE");
  assert.equal(events[0].title, "Machine Learning, lecture");
  assert.equal(events[0].startsAt, "2026-10-07T08:00:00.000Z", "BST in October");
  assert.ok(events.some((e) => e.startsAt === "2026-11-11T09:00:00.000Z"), "GMT in November");
  assert.ok(!events.some((e) => e.startsAt.startsWith("2026-11-04")), "EXDATE removed");
});

import { wakePlan } from "../src/lib/wake";

test("wake plan: 15 minutes earlier each week until the target", () => {
  assert.deepEqual(wakePlan("09:00", "07:30", 15, "2026-11-02", "2026-11-02"), { thisWeek: "09:00", nextWeek: "08:45", weeksLeft: 6, done: false });
  assert.equal(wakePlan("09:00", "07:30", 15, "2026-11-02", "2026-11-16").thisWeek, "08:30");
  const end = wakePlan("09:00", "07:30", 15, "2026-11-02", "2027-01-30");
  assert.equal(end.thisWeek, "07:30");
  assert.equal(end.done, true);
});
