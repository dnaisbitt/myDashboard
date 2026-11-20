import { minutesToTime, timeToMinutes } from "./time";
import type { Tone, ToneArea } from "./types";

/**
 * Reminder rules. Pure: give it a snapshot and the time, get the reminders that
 * are due right now. The job runs every 15 minutes; a reminder is due during the
 * hour after its time (so one late run still delivers it) and is sent at most once
 * per day per thing (the notification log enforces that).
 */
export type ReminderType =
  | "daily_plan"
  | "deadlines"
  | "overdue"
  | "habits"
  | "gym_booking"
  | "bedtime"
  | "weekly_review"
  | "goals"
  | "money_monthly";

type Def = { label: string; detail: string; at: string | null; area: ToneArea | null };

export const REMINDERS: Record<ReminderType, Def> = {
  daily_plan: { label: "Plan your day", detail: "Morning nudge to pick today's three.", at: "08:30", area: null },
  deadlines: { label: "Deadlines coming up", detail: "Anything due in the next 3 days.", at: "09:00", area: "deadlines" },
  overdue: { label: "Overdue tasks", detail: "Evening check if anything slipped.", at: "18:00", area: "deadlines" },
  habits: { label: "Habits not logged yet", detail: "Morning habits at 08:00, evening ones at 21:30, others at this time.", at: "19:00", area: "habits" },
  gym_booking: { label: "Book tomorrow's gym slot", detail: "The evening before a planned gym day, if not booked.", at: "20:00", area: "habits" },
  bedtime: { label: "Wind down for bed", detail: "45 minutes before your bedtime target (set in Body → Sleep).", at: null, area: "wake" },
  weekly_review: { label: "Sunday weekly review", detail: "Five minutes to look back and plan next week.", at: "19:00", area: null },
  goals: { label: "Goals that have gone quiet", detail: "Mondays, if a goal hasn't moved in 2+ weeks.", at: "09:00", area: null },
  money_monthly: { label: "Monthly money check", detail: "On the 1st of each month.", at: "10:00", area: null },
};

export const REMINDER_ORDER = Object.keys(REMINDERS) as ReminderType[];

export type ReminderPrefs = Partial<Record<ReminderType, { on?: boolean; at?: string }>>;

export function prefFor(prefs: ReminderPrefs, t: ReminderType) {
  const p = prefs[t] ?? {};
  return { on: p.on ?? true, at: p.at && /^\d{2}:\d{2}$/.test(p.at) ? p.at : REMINDERS[t].at };
}

export type Snapshot = {
  nowMin: number; // minutes since local midnight
  todayKey: string;
  isoWeekday: number; // Mon = 1
  dayOfMonth: number;
  tone: Record<ToneArea, Tone>;
  prefs: ReminderPrefs;
  bedtimeTarget: string | null; // "HH:MM"
  prioritiesPicked: number;
  deadlines: Array<{ id: string; title: string; daysAway: number; label: string; planned: boolean; exam: boolean }>;
  overdue: Array<{ id: string; title: string }>;
  habits: Array<{ id: string; title: string; kind: "build" | "check_in"; part: "morning" | "evening" | "any"; due: boolean; logged: boolean; minimum: string | null }>;
  gymTomorrow: { time: string; booked: boolean } | null;
  quietGoals: Array<{ id: string; title: string; days: number }>;
  hasBudget: boolean;
};

export type DueReminder = { type: ReminderType; refKey: string; title: string; body: string; url: string; at: string };

const inWindow = (nowMin: number, at: string) => nowMin >= timeToMinutes(at) && nowMin < timeToMinutes(at) + 60;

/** A quiet tone means "show it in the app, don't push it". */
function muted(s: Snapshot, area: ToneArea | null) {
  return area ? s.tone[area] === "quiet" : false;
}

export function dueReminders(s: Snapshot): DueReminder[] {
  const out: DueReminder[] = [];
  const on = (t: ReminderType) => prefFor(s.prefs, t).on && !muted(s, REMINDERS[t].area);
  const at = (t: ReminderType) => prefFor(s.prefs, t).at!;
  const push = (r: Omit<DueReminder, "at">, time: string) => out.push({ ...r, at: time });

  if (on("daily_plan") && inWindow(s.nowMin, at("daily_plan")) && s.prioritiesPicked === 0) {
    const soon = s.deadlines.filter((d) => d.daysAway <= 3).length;
    push(
      {
        type: "daily_plan",
        refKey: s.todayKey,
        title: "Pick today's three",
        body: soon ? `${soon} deadline${soon === 1 ? "" : "s"} in the next 3 days. Two minutes to choose what matters today.` : "Two minutes to choose what matters today.",
        url: "/",
      },
      at("daily_plan"),
    );
  }

  if (on("deadlines") && inWindow(s.nowMin, at("deadlines"))) {
    for (const d of s.deadlines.filter((x) => x.daysAway >= 0 && x.daysAway <= 3).slice(0, 3)) {
      const tone = s.tone[d.exam ? "exams" : "deadlines"];
      if (tone === "quiet") continue;
      const when = d.daysAway === 0 ? "today" : d.daysAway === 1 ? "tomorrow" : `in ${d.daysAway} days`;
      push(
        {
          type: "deadlines",
          refKey: d.id,
          title: `${d.title}: due ${when}`,
          body:
            tone === "direct"
              ? `Due ${d.label}. ${d.planned ? "A day is planned for it." : "No time planned for it yet."}`
              : `Due ${d.label}. ${d.planned ? "You've planned a day for it, nice." : "Want to block some time for it?"}`,
          url: "/planner",
        },
        at("deadlines"),
      );
    }
  }

  if (on("overdue") && inWindow(s.nowMin, at("overdue")) && s.overdue.length) {
    const n = s.overdue.length;
    push(
      {
        type: "overdue",
        refKey: s.todayKey,
        title: `${n} overdue task${n === 1 ? "" : "s"}`,
        body:
          s.tone.deadlines === "direct"
            ? `${s.overdue.slice(0, 2).map((t) => t.title).join(", ")}${n > 2 ? "…" : ""}. Give each a new day or drop it.`
            : `${s.overdue[0].title}${n > 1 ? ` and ${n - 1} more` : ""} slipped. Pick a new day in the Planner.`,
        url: "/planner",
      },
      at("overdue"),
    );
  }

  if (on("habits")) {
    for (const h of s.habits) {
      if (!h.due || h.logged) continue;
      const time = h.part === "morning" ? "08:00" : h.part === "evening" ? "21:30" : at("habits");
      if (!inWindow(s.nowMin, time)) continue;
      const gentle = s.tone.habits === "gentle";
      push(
        {
          type: "habits",
          refKey: h.id,
          title: h.kind === "check_in" ? `${h.title}?` : h.title,
          body:
            h.kind === "check_in"
              ? "One honest tap: yes or no."
              : gentle
                ? h.minimum
                  ? `Not logged yet. Even the short version counts: ${h.minimum}.`
                  : "Not logged yet. A small version still counts."
                : "Not logged yet today.",
          url: "/",
        },
        time,
      );
    }
  }

  if (on("gym_booking") && s.gymTomorrow && !s.gymTomorrow.booked && inWindow(s.nowMin, at("gym_booking"))) {
    push(
      {
        type: "gym_booking",
        refKey: s.todayKey,
        title: "Book tomorrow's gym slot",
        body: `Gym is pencilled in for ${s.gymTomorrow.time} tomorrow and it isn't booked yet.`,
        url: "/body",
      },
      at("gym_booking"),
    );
  }

  if (on("bedtime") && s.bedtimeTarget) {
    const wind = minutesToTime(timeToMinutes(s.bedtimeTarget) - 45);
    if (inWindow(s.nowMin, wind)) {
      push(
        {
          type: "bedtime",
          refKey: s.todayKey,
          title: "Time to wind down",
          body:
            s.tone.wake === "gentle"
              ? `Bed by ${s.bedtimeTarget} makes tomorrow morning easier. Phone on charge across the room?`
              : `Bed by ${s.bedtimeTarget}. Start winding down now.`,
          url: "/body/sleep",
        },
        wind,
      );
    }
  }

  if (on("weekly_review") && s.isoWeekday === 7 && inWindow(s.nowMin, at("weekly_review"))) {
    push(
      { type: "weekly_review", refKey: s.todayKey, title: "Weekly review", body: "Five minutes: what got done, what slipped, and next week around training and deadlines.", url: "/planner/review" },
      at("weekly_review"),
    );
  }

  if (on("goals") && s.isoWeekday === 1 && s.quietGoals.length && inWindow(s.nowMin, at("goals"))) {
    const g = s.quietGoals[0];
    push(
      {
        type: "goals",
        refKey: s.todayKey,
        title: `“${g.title}” has gone quiet`,
        body: `Nothing linked to it has moved in ${g.days} days. One small step this week?`,
        url: `/goals/${g.id}`,
      },
      at("goals"),
    );
  }

  if (on("money_monthly") && s.dayOfMonth === 1 && inWindow(s.nowMin, at("money_monthly"))) {
    push(
      {
        type: "money_monthly",
        refKey: s.todayKey,
        title: "Monthly money check",
        body: s.hasBudget ? "Check last month's spending and this week's allowance." : "Set up your term budget so “left this week” works.",
        url: "/money",
      },
      at("money_monthly"),
    );
  }

  return out;
}

/** Today's schedule of reminders (for Settings), whether or not they'll end up firing. */
export function scheduleFor(s: Pick<Snapshot, "prefs" | "bedtimeTarget" | "tone">) {
  return REMINDER_ORDER.map((t) => {
    const p = prefFor(s.prefs, t);
    const time = t === "bedtime" ? (s.bedtimeTarget ? minutesToTime(timeToMinutes(s.bedtimeTarget) - 45) : null) : p.at;
    return { type: t, ...REMINDERS[t], on: p.on, time, muted: REMINDERS[t].area ? s.tone[REMINDERS[t].area!] === "quiet" : false };
  });
}
