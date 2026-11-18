import "server-only";
import { notFound } from "next/navigation";
import { addDaysToKey, dateKey } from "@/lib/time";
import {
  GOAL_COLUMNS,
  HABIT_COLUMNS,
  MILESTONE_COLUMNS,
  PROJECT_COLUMNS,
  TASK_COLUMNS,
  type Goal,
  type GoalUpdate,
  type Habit,
  type HabitLog,
  type Milestone,
  type Project,
  type Task,
} from "@/lib/types";
import { getProfile, getViewer } from "./viewer";

export type ProjectSummary = Project & {
  open: number;
  done: number;
  overdue: number;
  lastActivity: string;
  goalTitle: string | null;
  milestones: Milestone[];
  health: "attention" | "delayed" | "progressing" | "idle" | "closed";
  healthReason: string;
};

/**
 * Health is computed from real activity, not set by hand:
 *  delayed   – past its deadline, or has overdue tasks
 *  attention – no open next step, or nothing touched in 14 days
 *  progressing – a task finished or added in the last 14 days
 */
function health(p: Project, s: { open: number; overdue: number; lastActivity: string }, todayKey: string, nowMs: number) {
  if (p.status === "done" || p.status === "dropped") return { health: "closed" as const, healthReason: p.status === "done" ? "Done" : "Dropped" };
  if (p.status === "paused") return { health: "idle" as const, healthReason: "Paused" };
  if (p.deadline && p.deadline < todayKey) return { health: "delayed" as const, healthReason: "Past its deadline" };
  if (s.overdue) return { health: "delayed" as const, healthReason: `${s.overdue} overdue task${s.overdue === 1 ? "" : "s"}` };
  if (s.open === 0) return { health: "attention" as const, healthReason: "No next step" };
  const idleDays = Math.floor((nowMs - Date.parse(s.lastActivity)) / 86_400_000);
  if (idleDays >= 14) return { health: "attention" as const, healthReason: `Untouched for ${idleDays} days` };
  return { health: "progressing" as const, healthReason: "Moving" };
}

export async function getProjects(): Promise<ProjectSummary[]> {
  const { supabase } = await getViewer();
  const { timezone: tz } = await getProfile();
  const nowMs = Date.now();
  const todayKey = dateKey(nowMs, tz);
  const [projects, tasks, milestones, goals] = await Promise.all([
    supabase.from("projects").select(PROJECT_COLUMNS).order("created_at", { ascending: false }),
    supabase.from("tasks").select("project_id,status,due_at,updated_at").not("project_id", "is", null).is("parent_id", null),
    supabase.from("milestones").select(MILESTONE_COLUMNS).not("project_id", "is", null).order("position"),
    supabase.from("goals").select("id,title"),
  ]);
  const err = projects.error ?? tasks.error ?? milestones.error ?? goals.error;
  if (err) throw new Error(`Could not load projects: ${err.message}`);
  const goalTitle = new Map((goals.data ?? []).map((g) => [g.id as string, g.title as string]));

  return ((projects.data ?? []) as Project[]).map((p) => {
    const mine = (tasks.data ?? []).filter((t) => t.project_id === p.id);
    const open = mine.filter((t) => t.status === "open" || t.status === "inbox");
    const overdue = open.filter((t) => t.due_at && Date.parse(t.due_at as string) < nowMs).length;
    const lastActivity = [p.updated_at, ...mine.map((t) => t.updated_at as string)].sort().at(-1)!;
    const stats = { open: open.length, done: mine.filter((t) => t.status === "done").length, overdue, lastActivity };
    return {
      ...p,
      ...stats,
      goalTitle: p.goal_id ? (goalTitle.get(p.goal_id) ?? null) : null,
      milestones: ((milestones.data ?? []) as Milestone[]).filter((m) => m.project_id === p.id),
      ...health(p, stats, todayKey, nowMs),
    };
  });
}

export async function getProject(id: string) {
  const { supabase } = await getViewer();
  const profile = await getProfile();
  const [project, tasks, milestones, goals] = await Promise.all([
    supabase.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("tasks").select(TASK_COLUMNS).eq("project_id", id).is("parent_id", null).neq("status", "archived").order("status").order("due_at", { nullsFirst: false }),
    supabase.from("milestones").select(MILESTONE_COLUMNS).eq("project_id", id).order("position"),
    supabase.from("goals").select("id,title").in("status", ["active", "paused"]).order("title"),
  ]);
  if (project.error) throw new Error(`Could not load the project: ${project.error.message}`);
  if (!project.data) notFound();
  return {
    project: project.data as Project,
    tasks: (tasks.data ?? []) as Task[],
    milestones: (milestones.data ?? []) as Milestone[],
    goals: (goals.data ?? []) as Array<{ id: string; title: string }>,
    tz: profile.timezone,
    nowMs: Date.now(),
  };
}

export type GoalSummary = Goal & {
  milestones: Milestone[];
  projects: Array<{ id: string; title: string; status: string }>;
  habits: Array<{ id: string; title: string }>;
  lastUpdate: GoalUpdate | null;
  /** Days since anything linked to this goal moved. */
  quietDays: number;
};

export async function getGoals(): Promise<GoalSummary[]> {
  const { supabase } = await getViewer();
  const [goals, milestones, projects, habits, updates, logs] = await Promise.all([
    supabase.from("goals").select(GOAL_COLUMNS).order("created_at"),
    supabase.from("milestones").select(MILESTONE_COLUMNS).not("goal_id", "is", null).order("position"),
    supabase.from("projects").select("id,title,status,goal_id,updated_at").not("goal_id", "is", null),
    supabase.from("habits").select("id,title,goal_id").not("goal_id", "is", null).is("archived_at", null),
    supabase.from("goal_updates").select("id,goal_id,body,progress,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("habit_logs").select("habit_id,created_at").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);
  const err = goals.error ?? milestones.error ?? projects.error ?? habits.error ?? updates.error ?? logs.error;
  if (err) throw new Error(`Could not load goals: ${err.message}`);

  const nowMs = Date.now();
  return ((goals.data ?? []) as Goal[]).map((g) => {
    const ms = ((milestones.data ?? []) as Milestone[]).filter((m) => m.goal_id === g.id);
    const ps = (projects.data ?? []).filter((p) => p.goal_id === g.id);
    const hs = (habits.data ?? []).filter((h) => h.goal_id === g.id);
    const ups = ((updates.data ?? []) as GoalUpdate[]).filter((u) => u.goal_id === g.id);
    const habitIds = new Set(hs.map((h) => h.id));
    const stamps = [
      g.updated_at,
      ...ps.map((p) => p.updated_at as string),
      ...ups.map((u) => u.created_at),
      ...ms.map((m) => m.done_at).filter(Boolean) as string[],
      ...(logs.data ?? []).filter((l) => habitIds.has(l.habit_id)).map((l) => l.created_at as string),
    ];
    const last = stamps.sort().at(-1)!;
    return {
      ...g,
      milestones: ms,
      projects: ps.map((p) => ({ id: p.id as string, title: p.title as string, status: p.status as string })),
      habits: hs.map((h) => ({ id: h.id as string, title: h.title as string })),
      lastUpdate: ups[0] ?? null,
      quietDays: Math.floor((nowMs - Date.parse(last)) / 86_400_000),
    };
  });
}

export async function getGoal(id: string) {
  const { supabase } = await getViewer();
  const profile = await getProfile();
  const [goal, milestones, updates, projects, habits] = await Promise.all([
    supabase.from("goals").select(GOAL_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("milestones").select(MILESTONE_COLUMNS).eq("goal_id", id).order("position"),
    supabase.from("goal_updates").select("id,goal_id,body,progress,created_at").eq("goal_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("projects").select("id,title,status").eq("goal_id", id),
    supabase.from("habits").select(HABIT_COLUMNS).eq("goal_id", id).is("archived_at", null),
  ]);
  if (goal.error) throw new Error(`Could not load the goal: ${goal.error.message}`);
  if (!goal.data) notFound();
  const projectIds = (projects.data ?? []).map((p) => p.id as string);
  const tasks = projectIds.length
    ? await supabase.from("tasks").select(TASK_COLUMNS).in("project_id", projectIds).eq("status", "open").is("parent_id", null).order("due_at", { nullsFirst: false }).limit(20)
    : { data: [] as Task[] };
  return {
    goal: goal.data as Goal,
    milestones: (milestones.data ?? []) as Milestone[],
    updates: (updates.data ?? []) as GoalUpdate[],
    projects: (projects.data ?? []) as Array<{ id: string; title: string; status: string }>,
    habits: (habits.data ?? []) as Habit[],
    tasks: (tasks.data ?? []) as Task[],
    tz: profile.timezone,
    nowMs: Date.now(),
  };
}

/** Active habits and the last ~10 weeks of logs (enough for streaks, rates and the history grid). */
export async function getHabits(includeArchived = false) {
  const { supabase } = await getViewer();
  const { timezone: tz } = await getProfile();
  const todayKey = dateKey(Date.now(), tz);
  let q = supabase.from("habits").select(HABIT_COLUMNS).order("position");
  if (!includeArchived) q = q.is("archived_at", null);
  const [habits, logs, goals] = await Promise.all([
    q,
    supabase.from("habit_logs").select("habit_id,on_date,status").gte("on_date", addDaysToKey(todayKey, -400)),
    supabase.from("goals").select("id,title").in("status", ["active", "paused"]).order("title"),
  ]);
  const err = habits.error ?? logs.error ?? goals.error;
  if (err) throw new Error(`Could not load habits: ${err.message}`);
  return {
    habits: (habits.data ?? []) as Habit[],
    logs: (logs.data ?? []) as HabitLog[],
    goals: (goals.data ?? []) as Array<{ id: string; title: string }>,
    todayKey,
    tz,
  };
}

/**
 * The resurfacing queue: nothing is allowed to sit forever.
 *  - Inbox items captured 2+ days ago
 *  - Open tasks with no date that nobody has touched for 14+ days
 * Snoozed items stay hidden until their snooze date.
 */
export async function getDecisionQueue(limit = 20) {
  const { supabase } = await getViewer();
  const { timezone: tz } = await getProfile();
  const nowMs = Date.now();
  const todayKey = dateKey(nowMs, tz);
  const inboxCutoff = new Date(nowMs - 2 * 86_400_000).toISOString();
  const staleCutoff = new Date(nowMs - 14 * 86_400_000).toISOString();
  const notSnoozed = `snoozed_until.is.null,snoozed_until.lte.${todayKey}`;
  const [inbox, stale] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("status", "inbox").lt("created_at", inboxCutoff).or(notSnoozed).order("created_at").limit(limit),
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("status", "open")
      .is("due_at", null)
      .is("planned_on", null)
      .is("today_date", null)
      .is("parent_id", null)
      .lt("updated_at", staleCutoff)
      .or(notSnoozed)
      .order("updated_at")
      .limit(limit),
  ]);
  const err = inbox.error ?? stale.error;
  if (err) throw new Error(`Could not load items to review: ${err.message}`);
  return [...((inbox.data ?? []) as Task[]), ...((stale.data ?? []) as Task[])].slice(0, limit);
}
