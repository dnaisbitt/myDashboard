import "server-only";
import { getGoals, getProjects } from "@/lib/data/plans";
import { getTodayData } from "@/lib/data/today";
import { habitStats, isScheduled } from "@/lib/habits";
import { describeDue, formatTime } from "@/lib/time";

/**
 * The context layer: gathers the user's real data into a compact, explicit
 * snapshot for the model. Anything not tracked yet is listed under
 * `notTracked`, so the assistant can say "I don't have that" rather than guess.
 */
export type AssistantContext = {
  generatedAt: string;
  timezone: string;
  today: string;
  priorities: Array<{ title: string; done: boolean }>;
  deadlines: Array<{ title: string; due: string; overdue: boolean }>;
  schedule: Array<{ title: string; kind: string; start: string; end: string; location: string | null; cancelled: boolean }>;
  habits: Array<{ title: string; dueToday: boolean; loggedToday: string | null; streak: number; week?: string }>;
  goals: Array<{ title: string; horizon: string; progress: number; target: string | null; deadline: string | null; quietDays: number; milestonesDone: string }>;
  projects: Array<{ title: string; status: string; health: string; reason: string; openTasks: number; deadline: string | null; goal: string | null }>;
  waitingForDecision: string[];
  counts: { inbox: number; doneToday: number; doneThisWeek: number };
  notTracked: string[];
};

export async function buildAssistantContext(): Promise<AssistantContext> {
  const [d, goals, projects] = await Promise.all([getTodayData(), getGoals(), getProjects()]);
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
    schedule: d.blocks.map((b) => ({
      title: b.title,
      kind: b.kind,
      start: formatTime(b.startsAt, tz),
      end: formatTime(b.endsAt, tz),
      location: b.location,
      cancelled: b.cancelled,
    })),
    habits: d.habits.map((h) => {
      const s = habitStats(h, d.habitLogs, d.todayKey);
      return {
        title: h.title,
        dueToday: isScheduled(h, d.todayKey),
        loggedToday: s.todayLog?.status ?? null,
        streak: s.streak,
        ...(s.weekTarget ? { week: `${s.weekDone}/${s.weekTarget}` } : {}),
      };
    }),
    goals: goals
      .filter((g) => g.status === "active")
      .map((g) => ({
        title: g.title,
        horizon: g.horizon,
        progress: g.progress,
        target: g.target,
        deadline: g.deadline,
        quietDays: g.quietDays,
        milestonesDone: `${g.milestones.filter((m) => m.done_at).length}/${g.milestones.length}`,
      })),
    projects: projects
      .filter((p) => p.health !== "closed")
      .map((p) => ({
        title: p.title,
        status: p.status,
        health: p.health,
        reason: p.healthReason,
        openTasks: p.open,
        deadline: p.deadline,
        goal: p.goalTitle,
      })),
    waitingForDecision: d.decisions.map((t) => t.title),
    counts: { inbox: d.inboxCount, doneToday: d.doneToday, doneThisWeek: d.doneThisWeek },
    notTracked: ["money and budget (Phase 5)", "gym sessions, sleep and food logs (Phase 5)", "how reminders were acted on (Phase 7)"],
  };
}

/** Ground rules every prompt starts with (used from Phase 6). */
export const ASSISTANT_RULES = [
  "Use only the data in the provided context. Never invent tasks, events, numbers or history.",
  "If something isn't in the context, say you don't have that data. Items in notTracked are not available.",
  "You cannot see the user's phone, apps, email, university portal, gym bookings or bank.",
  "Prefer realistic plans over packed ones. Flag overcommitment plainly.",
].join("\n");
