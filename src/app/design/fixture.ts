// DESIGN REVIEW FIXTURE: used only by the dev-only /design pages to review
// layout without a database. Never imported by the real app.
import type { TodayData } from "@/lib/data/today";
import { addDaysToKey, dateKey, DEFAULT_TZ, localMinutes, localToIso } from "@/lib/time";
import type { CalendarEvent, Task } from "@/lib/types";

const tz = DEFAULT_TZ;

function hhmm(mins: number) {
  const m = Math.max(0, Math.min(23 * 60 + 45, mins));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function task(id: number, title: string, extra: Partial<Task> = {}): Task {
  return {
    id: `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`,
    title,
    notes: null,
    status: "open",
    priority: 2,
    due_at: null,
    due_has_time: false,
    today_date: null,
    today_rank: null,
    completed_at: null,
    project_id: null,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

export function buildFixture(nowMs: number, opts: { empty?: boolean } = {}): TodayData {
  const today = dateKey(nowMs, tz);
  const now = Math.floor(localMinutes(nowMs, tz) / 15) * 15;
  const at = (dayOffset: number, mins: number) => localToIso(addDaysToKey(today, dayOffset), hhmm(mins), tz);
  const ev = (id: number, title: string, kind: CalendarEvent["kind"], from: number, to: number, location: string | null = null): CalendarEvent => ({
    id: `00000000-0000-0000-0001-${String(id).padStart(12, "0")}`,
    title,
    kind,
    starts_at: at(0, from),
    ends_at: at(0, to),
    location,
    notes: null,
    task_id: null,
  });

  const base: TodayData = {
    profile: {
      id: "fixture",
      display_name: "Sam",
      timezone: tz,
      tone: { habits: "gentle", wake: "gentle", deadlines: "direct", exams: "direct", optional: "quiet" },
      trackers: { calories: false, protein: false, lifts: false },
      ai_enabled: false,
    },
    nowMs,
    todayKey: today,
    priorities: [],
    carryOver: [],
    candidates: [],
    deadlines: [],
    events: [],
    inboxCount: 0,
    doneThisWeek: 0,
    doneToday: 0,
    activeGoals: 0,
    activeProjects: 0,
  };
  if (opts.empty) return base;

  return {
    ...base,
    priorities: [
      task(1, "10 past-paper questions on Chapter 4", { today_date: today, today_rank: 1, priority: 1 }),
      task(2, "Email lab partner about the dataset", { today_date: today, today_rank: 2, status: "done", completed_at: new Date(nowMs).toISOString() }),
      task(3, "Book Thursday gym slot", { today_date: today, today_rank: 3 }),
    ],
    candidates: [task(4, "Draft side-hustle idea list"), task(5, "Renew railcard", { due_at: at(5, 23 * 60 + 59) })],
    deadlines: [
      task(6, "Return library books", { due_at: at(-1, 23 * 60 + 59) }),
      task(7, "Coursework 2: neural nets report", { due_at: at(2, 17 * 60), due_has_time: true, priority: 1 }),
      task(8, "Korfball subs", { due_at: at(4, 23 * 60 + 59) }),
      task(9, "Statistics problem sheet", { due_at: at(6, 9 * 60), due_has_time: true }),
    ],
    events: [
      ev(1, "Machine Learning lecture", "lecture", now - 180, now - 60, "Brockington U.0.05"),
      ev(2, "Focus: coursework section 2", "focus", now - 30, now + 30, "Library, level 3"),
      ev(3, "Korfball training", "training", now + 150, now + 240, "Sports hall"),
    ],
    inboxCount: 2,
    doneThisWeek: 7,
    doneToday: 1,
  };
}
