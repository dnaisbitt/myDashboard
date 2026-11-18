import "server-only";
import { getTodayData } from "@/lib/data/today";
import { describeDue, formatTime } from "@/lib/time";

/**
 * The context layer: gathers the user's real data into a compact, explicit
 * snapshot for the model. Anything not tracked yet is listed under
 * `notTracked`, so the assistant can say "I don't have that" rather than guess.
 *
 * Grows each phase (timetable, habits, goals, money, body…).
 */
export type AssistantContext = {
  generatedAt: string;
  timezone: string;
  today: string;
  priorities: Array<{ title: string; done: boolean }>;
  deadlines: Array<{ title: string; due: string; overdue: boolean }>;
  schedule: Array<{ title: string; kind: string; start: string; end: string; location: string | null }>;
  counts: { inbox: number; doneToday: number; doneThisWeek: number; activeGoals: number; activeProjects: number };
  notTracked: string[];
};

export async function buildAssistantContext(): Promise<AssistantContext> {
  const d = await getTodayData();
  const tz = d.profile.timezone;
  return {
    generatedAt: new Date(d.nowMs).toISOString(),
    timezone: tz,
    today: d.todayKey,
    priorities: d.priorities.map((t) => ({ title: t.title, done: t.status === "done" })),
    deadlines: d.deadlines.map((t) => {
      const info = describeDue(t.due_at!, t.due_has_time, d.nowMs, tz);
      return { title: t.title, due: info.label, overdue: info.overdue };
    }),
    schedule: d.events.map((e) => ({
      title: e.title,
      kind: e.kind,
      start: formatTime(e.starts_at, tz),
      end: formatTime(e.ends_at, tz),
      location: e.location,
    })),
    counts: {
      inbox: d.inboxCount,
      doneToday: d.doneToday,
      doneThisWeek: d.doneThisWeek,
      activeGoals: d.activeGoals,
      activeProjects: d.activeProjects,
    },
    notTracked: [
      "recurring lecture timetable (Phase 4)",
      "habits and streaks (Phase 4)",
      "goal milestones and progress (Phase 4)",
      "money and budget (Phase 5)",
      "gym, sleep and food logs (Phase 5)",
    ],
  };
}

/** Ground rules every prompt starts with (used from Phase 6). */
export const ASSISTANT_RULES = [
  "Use only the data in the provided context. Never invent tasks, events, numbers or history.",
  "If something isn't in the context, say you don't have that data. Items in notTracked are not available.",
  "You cannot see the user's phone, apps, email, university portal, gym bookings or bank.",
  "Prefer realistic plans over packed ones. Flag overcommitment plainly.",
].join("\n");
