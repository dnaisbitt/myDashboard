// DESIGN REVIEW FIXTURE: used only by the dev-only /design pages to review
// layout without a database. Never imported by the real app.
import type { TodayData } from "@/lib/data/today";
import { eventToBlock, expandSessions, sortBlocks } from "@/lib/schedule";
import { addDaysToKey, dateKey, DEFAULT_TZ, isoWeekday, localMinutes, localToIso, minutesToTime } from "@/lib/time";
import type { CalendarEvent, Habit, HabitLog, Task } from "@/lib/types";

const tz = DEFAULT_TZ;

function hhmm(mins: number) {
  return minutesToTime(Math.max(0, Math.min(23 * 60 + 45, mins)));
}

function task(id: number, title: string, extra: Partial<Task> = {}): Task {
  const iso = new Date().toISOString();
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
    parent_id: null,
    category: null,
    recurrence: null,
    planned_on: null,
    estimate_minutes: null,
    snoozed_until: null,
    created_at: iso,
    updated_at: iso,
    ...extra,
  };
}

function habit(id: number, title: string, extra: Partial<Habit> = {}): Habit {
  return {
    id: `00000000-0000-0000-0002-${String(id).padStart(12, "0")}`,
    title,
    kind: "build",
    frequency: "daily",
    target_per_week: null,
    weekdays: null,
    part_of_day: "any",
    minimum_version: null,
    goal_id: null,
    position: id,
    archived_at: null,
    created_at: "2026-09-01T09:00:00Z",
    ...extra,
  };
}

export function buildFixture(nowMs: number, opts: { empty?: boolean } = {}): TodayData {
  const today = dateKey(nowMs, tz);
  const now = Math.floor(localMinutes(nowMs, tz) / 15) * 15;
  const at = (dayOffset: number, mins: number) => localToIso(addDaysToKey(today, dayOffset), hhmm(mins), tz);
  const ev = (id: number, title: string, kind: CalendarEvent["kind"], from: number, to: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: `00000000-0000-0000-0001-${String(id).padStart(12, "0")}`,
    title,
    kind,
    starts_at: at(0, from),
    ends_at: at(0, to),
    location: null,
    notes: null,
    task_id: null,
    place: null,
    outcome: null,
    ...extra,
  });

  const base: TodayData = {
    profile: {
      id: "fixture",
      display_name: "Sam",
      timezone: tz,
      tone: { habits: "gentle", wake: "gentle", deadlines: "direct", exams: "direct", optional: "quiet" },
      trackers: { calories: false, protein: false, lifts: false },
      ai_enabled: false,
      wake_current: null,
      wake_target: null,
      wake_step_minutes: 15,
      wake_plan_started: null,
      bedtime_target: null,
      gym_target_per_week: 4,
      gym_quiet_times: null,
    },
    nowMs,
    todayKey: today,
    priorities: [],
    carryOver: [],
    candidates: [],
    deadlines: [],
    blocks: [],
    habits: [],
    habitLogs: [],
    decisions: [],
    inboxCount: 0,
    doneThisWeek: 0,
    doneToday: 0,
    activeGoals: 0,
    quietGoals: [],
    activeProjects: 0,
    projectsNeedingAttention: 0,
    money: null,
    gym: { done: 0, target: 4, today: null },
    meals: { dinner: null, lunch: null },
    briefing: null,
  };
  if (opts.empty) return base;

  const gym = habit(1, "Gym", { frequency: "weekly", target_per_week: 4, minimum_version: "30 minutes" });
  const phone = habit(2, "Phone-down check-in", { kind: "check_in", part_of_day: "evening" });
  const logs: HabitLog[] = [
    { habit_id: gym.id, on_date: addDaysToKey(today, -1), status: "done" },
    { habit_id: phone.id, on_date: addDaysToKey(today, -1), status: "done" },
    { habit_id: phone.id, on_date: addDaysToKey(today, -2), status: "done" },
  ];
  const session = {
    id: "00000000-0000-0000-0003-000000000001",
    title: "Statistics seminar",
    kind: "seminar" as const,
    weekday: isoWeekday(today),
    start_time: `${hhmm(now + 300)}:00`,
    end_time: `${hhmm(now + 360)}:00`,
    location: "Schofield 1.03",
    starts_on: addDaysToKey(today, -30),
    ends_on: addDaysToKey(today, 30),
  };

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
    ],
    blocks: sortBlocks([
      eventToBlock(ev(1, "Machine Learning lecture", "lecture", now - 180, now - 120, { location: "Brockington U.0.05" }), today),
      eventToBlock(ev(4, "10 questions, Ch. 3", "focus", now - 100, now - 40, { place: "library" }), today),
      eventToBlock(ev(2, "Coursework section 2", "focus", now - 30, now + 30, { place: "library" }), today),
      eventToBlock(ev(3, "Korfball training", "training", now + 150, now + 240, { location: "Sports hall" }), today),
      ...expandSessions([session], [{ session_id: session.id, on_date: today }], today, today, tz),
    ]),
    habits: [gym, phone],
    habitLogs: logs,
    decisions: [task(10, "Look into a part-time tutoring idea", { status: "inbox", created_at: at(-9, 600) })],
    inboxCount: 2,
    doneThisWeek: 7,
    doneToday: 1,
    activeGoals: 5,
    quietGoals: [{ id: "g", title: "Side hustle: pick one idea", quietDays: 16 }],
    activeProjects: 3,
    projectsNeedingAttention: 1,
    money: { leftThisWeek: 4250, allowancePerWeek: 9500 },
    gym: { done: 2, target: 4, today: null },
    meals: { dinner: "Gnocchi with pesto", lunch: "Leftover bolognese" },
  };
}
