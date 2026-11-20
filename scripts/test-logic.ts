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

import { computeBudget, formatGBP, guessMapping, mapRows, occurrences, parseAmount, parseBankDate, parseCsv, weeklySpend } from "../src/lib/money";
import { bedClock, bedMinutes, sleepChain, weekLoad } from "../src/lib/body";
import { busyEvening, planWeek, shoppingFromPlan, type Recipe } from "../src/lib/meals";

const term = { id: "p", title: "Term 1", starts_on: "2026-09-28", ends_on: "2026-12-13", opening_pence: 20000 };

test("money: amounts and formatting", () => {
  assert.equal(parseAmount("£4.50"), 450);
  assert.equal(parseAmount("1,204"), 120400);
  assert.equal(parseAmount("-3"), -300);
  assert.equal(parseAmount("abc"), null);
  assert.equal(formatGBP(450), "£4.50");
  assert.equal(formatGBP(120449, { whole: true }), "£1,204");
});

test("money: recurring occurrences", () => {
  assert.deepEqual(occurrences({ cadence: "monthly", first_on: "2026-10-01", last_on: null }, "2026-09-28", "2026-12-13"), ["2026-10-01", "2026-11-01", "2026-12-01"]);
  assert.equal(occurrences({ cadence: "weekly", first_on: "2026-09-28", last_on: null }, "2026-09-28", "2026-12-13").length, 11);
});

test("money: weekly allowance and 'left this week'", () => {
  const items = [
    { id: "1", kind: "income" as const, title: "Loan", amount_pence: 300000, cadence: "once" as const, first_on: "2026-09-28", last_on: null, category: null },
    { id: "2", kind: "commitment" as const, title: "Rent", amount_pence: 50000, cadence: "monthly" as const, first_on: "2026-10-01", last_on: null, category: null },
  ];
  const txns = [
    { id: "a", occurred_on: "2026-11-10", amount_pence: 6000, category: "Groceries", note: null, source: "manual" as const },
    { id: "b", occurred_on: "2026-11-17", amount_pence: 1500, category: "Takeaway", note: null, source: "manual" as const },
  ];
  // Wed 18 Nov: week starts Mon 16; weeks remaining 16–22, 23–29, 30–6, 7–13 = 4
  const b = computeBudget(term, items, txns, "2026-11-18");
  assert.equal(b.weeksRemaining, 4);
  assert.equal(b.income, 300000);
  assert.equal(b.commitments, 150000);
  const pool = 20000 + 300000 - 150000 - 6000;
  assert.equal(b.allowancePerWeek, Math.floor(pool / 4));
  assert.equal(b.leftThisWeek, Math.floor(pool / 4) - 1500);
  assert.equal(b.nextCommitment?.on, "2026-12-01");
  assert.equal(b.lowPoint, null);
});

test("money: warns about a dip before the instalment lands", () => {
  const items = [{ id: "1", kind: "income" as const, title: "Loan", amount_pence: 300000, cadence: "once" as const, first_on: "2026-12-10", last_on: null, category: null }];
  const b = computeBudget({ ...term, opening_pence: 1000 }, items, [], "2026-11-18");
  assert.ok(b.lowPoint && b.lowPoint.pence < 0 && b.lowPoint.on < "2026-12-10");
});

test("money: weekly spend series", () => {
  const w = weeklySpend(term, [{ id: "a", occurred_on: "2026-11-17", amount_pence: 900, category: "x", note: null, source: "manual" }], "2026-11-18");
  assert.equal(w.at(-1)?.start, "2026-11-16");
  assert.equal(w.at(-1)?.pence, 900);
});

test("csv: quoted fields, UK dates, auto-mapping, de-dup keys", () => {
  const text = 'Date,Description,Amount\r\n18/11/2026,"TESCO STORES, LOUGHBOROUGH",-12.40\r\n18/11/2026,"TESCO STORES, LOUGHBOROUGH",-12.40\r\n19/11/2026,Student Finance,3000.00\r\nbad,row,x\r\n';
  const rows = parseCsv(text);
  assert.equal(rows.length, 5);
  const m = guessMapping(rows[0])!;
  const { rows: out, skipped } = mapRows(rows.slice(1), m);
  assert.equal(skipped, 1);
  assert.equal(out[0].amountPence, 1240);
  assert.equal(out[0].category, "Groceries");
  assert.equal(out[2].amountPence, -300000);
  assert.notEqual(out[0].importKey, out[1].importKey, "two identical purchases stay two rows");
  assert.equal(parseBankDate("18 Nov 2026"), "2026-11-18");
  assert.equal(parseBankDate("31/02/2026"), null);
});

test("csv: separate paid-out / paid-in columns", () => {
  const rows = parseCsv("Date,Details,Paid out,Paid in\n2026-11-18,Greggs,3.10,\n2026-11-18,Refund,,5.00\n");
  const { rows: out } = mapRows(rows.slice(1), guessMapping(rows[0])!);
  assert.deepEqual(out.map((r) => r.amountPence), [310, -500]);
  assert.equal(out[0].category, "Eating out");
});

test("body: weekly load flags no rest days and over-target weeks", () => {
  const wk = "2026-11-16";
  const d = (n: number) => `2026-11-${16 + n}`;
  assert.equal(weekLoad({ gym: [d(0), d(2), d(4), d(5)], training: [d(1), d(3)], matches: [d(5)], weekStart: wk }).level, "balanced");
  assert.equal(weekLoad({ gym: [d(0), d(1), d(2), d(3), d(4), d(5)], training: [d(0), d(2), d(4)], matches: [d(6)], weekStart: wk }).level, "too much");
  assert.match(weekLoad({ gym: [d(0)], training: [d(1)], matches: [], weekStart: wk }).advice, /room for 3 more/);
});

test("body: bedtimes past midnight sort after earlier ones", () => {
  const before = bedMinutes({ night_of: "2026-11-17", bed_at: "2026-11-17T23:30:00Z", wake_at: null }, TZ)!;
  const after = bedMinutes({ night_of: "2026-11-17", bed_at: "2026-11-18T01:15:00Z", wake_at: null }, TZ)!;
  assert.ok(after > before);
  assert.equal(bedClock(after), "01:15");
});

test("body: sleep chain needs enough nights and compares next days", () => {
  const logs = [17, 16, 15, 14, 13, 12].map((d, i) => ({
    night_of: `2026-11-${d}`,
    bed_at: i < 3 ? `2026-11-${d + 1}T01:30:00Z` : `2026-11-${d}T23:00:00Z`,
    wake_at: i < 3 ? `2026-11-${d + 1}T10:00:00Z` : `2026-11-${d + 1}T07:30:00Z`,
  }));
  const next = new Map(logs.map((l, i) => [`2026-11-${Number(l.night_of.slice(8)) + 1}`, { tasksDone: i < 3 ? 1 : 4, focusStayed: 0, focusAnswered: 0 }]));
  const c = sleepChain(logs, next, TZ)!;
  assert.equal(c.late.nights, 3);
  assert.equal(c.late.avgTasks, 1);
  assert.equal(c.early.avgTasks, 4);
  assert.equal(sleepChain(logs.slice(0, 4), next, TZ), null);
});

const bolognese: Recipe = {
  id: "r1", title: "Bolognese", status: "staple", portions: 2, minutes: 30, method: null, protein_g: 60,
  ingredients: [{ name: "Lean mince", qty: "500", unit: "g" }, { name: "Pasta", qty: "200", unit: "g" }],
};
const gnocchi: Recipe = { ...bolognese, id: "r2", title: "Gnocchi", ingredients: [{ name: "Gnocchi", qty: "1", unit: "pack" }, { name: "Pasta", qty: "100", unit: "g" }] };

test("meals: leftover lunch links to last night's cook; busy evenings flagged; shopping merges", () => {
  const rows = [
    { id: "m1", on_date: "2026-11-16", recipe_id: "r1", note: null },
    { id: "m2", on_date: "2026-11-18", recipe_id: "r2", note: null },
  ];
  const training = { key: "t", source: "session" as const, id: "s", dateKey: "2026-11-18", title: "Korfball training", kind: "training" as const,
    startsAt: "2026-11-18T19:00:00Z", endsAt: "2026-11-18T21:00:00Z", location: null, cancelled: false };
  const week = planWeek("2026-11-16", rows, [bolognese, gnocchi], new Map([["2026-11-18", [training]]]), TZ);
  assert.equal(week[1].lunch?.recipe.title, "Bolognese");
  assert.equal(week[0].lunch, null);
  assert.equal(week[2].busy?.reason, "Korfball training");
  assert.equal(busyEvening([{ ...training, cancelled: true }], TZ), null);
  const list = shoppingFromPlan(week);
  assert.deepEqual(list.find((i) => i.name === "Pasta"), { name: "Pasta", qty: "300 g" });
});

import { vetProposals } from "../src/lib/schedule";

test("assistant proposals: clashes, past times, bad ranges and self-overlaps are dropped", () => {
  const toIso = (k: string, t: string) => localToIso(k, t, TZ);
  const existing = [
    { title: "Korfball training", startsAt: toIso("2026-11-18", "19:00"), endsAt: toIso("2026-11-18", "21:00"), cancelled: false },
    { title: "Cancelled lecture", startsAt: toIso("2026-11-18", "10:00"), endsAt: toIso("2026-11-18", "11:00"), cancelled: true },
  ];
  const { keep, dropped } = vetProposals(
    [
      { date: "2026-11-18", start: "17:00", end: "18:00", title: "Ch. 4 questions" },
      { date: "2026-11-18", start: "20:00", end: "21:00", title: "Clashes with training" },
      { date: "2026-11-18", start: "10:00", end: "11:00", title: "Uses the cancelled slot" },
      { date: "2026-11-18", start: "17:30", end: "18:30", title: "Overlaps the first proposal" },
      { date: "2026-11-18", start: "08:00", end: "09:00", title: "Already past" },
      { date: "2026-11-30", start: "09:00", end: "10:00", title: "Too far ahead" },
      { date: "2026-11-18", start: "15:00", end: "14:00", title: "Backwards" },
    ],
    existing,
    { fromKey: "2026-11-18", toKey: "2026-11-24", nowMs: Date.parse("2026-11-18T09:30:00Z"), toIso },
  );
  assert.deepEqual(keep.map((k) => k.title), ["Ch. 4 questions", "Uses the cancelled slot"]);
  assert.equal(dropped.length, 5);
  assert.match(dropped[0].reason, /Korfball/);
});
