import "server-only";
import { eventToBlock, expandSessions, sortBlocks, type Block } from "@/lib/schedule";
import { addDaysToKey, dateKey, startOfLocalDay, weekStartKey } from "@/lib/time";
import {
  EVENT_COLUMNS,
  HABIT_COLUMNS,
  SESSION_COLUMNS,
  TASK_COLUMNS,
  type CalendarEvent,
  type Habit,
  type HabitLog,
  type Profile,
  type Task,
  type TimetableSession,
} from "@/lib/types";
import { computeBudget } from "@/lib/money";
import { getMoney } from "./life";
import { getDecisionQueue, getGoals, getProjects } from "./plans";
import { getProfile, getViewer } from "./viewer";

export type TodayData = {
  profile: Profile;
  nowMs: number;
  todayKey: string;
  priorities: Task[];
  carryOver: Task[];
  candidates: Task[];
  deadlines: Task[];
  blocks: Block[];
  habits: Habit[];
  habitLogs: HabitLog[];
  decisions: Task[];
  inboxCount: number;
  doneThisWeek: number;
  doneToday: number;
  activeGoals: number;
  quietGoals: Array<{ id: string; title: string; quietDays: number }>;
  activeProjects: number;
  projectsNeedingAttention: number;
  money: { leftThisWeek: number; allowancePerWeek: number } | null;
  gym: { done: number; target: number; today: "full" | "minimum" | null };
  meals: { dinner: string | null; lunch: string | null };
  briefing: { content: string; createdAt: string } | null;
};

/** Everything the Today page shows, from real rows only. */
export async function getTodayData(): Promise<TodayData> {
  const { supabase } = await getViewer();
  const profile = await getProfile();
  const tz = profile.timezone;
  const nowMs = Date.now();
  const todayKey = dateKey(nowMs, tz);
  const dayStart = startOfLocalDay(todayKey, tz);
  const dayEnd = startOfLocalDay(addDaysToKey(todayKey, 1), tz);
  const horizon = startOfLocalDay(addDaysToKey(todayKey, 8), tz);
  const weekStart = startOfLocalDay(weekStartKey(todayKey), tz);

  const [priorities, carryOver, candidates, deadlines, events, sessions, exceptions, habits, logs, inbox, doneWeek, doneToday] =
    await Promise.all([
      supabase.from("tasks").select(TASK_COLUMNS).eq("today_date", todayKey).order("today_rank"),
      supabase.from("tasks").select(TASK_COLUMNS).lt("today_date", todayKey).eq("status", "open").order("today_date", { ascending: false }).limit(5),
      supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("status", "open")
        .is("parent_id", null)
        .or(`today_date.is.null,today_date.neq.${todayKey}`)
        .or(`planned_on.is.null,planned_on.lte.${todayKey}`)
        .order("planned_on", { ascending: true, nullsFirst: false })
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("priority", { ascending: true })
        .limit(6),
      supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .in("status", ["open", "inbox"])
        .is("parent_id", null)
        .not("due_at", "is", null)
        .lt("due_at", horizon)
        .order("due_at", { ascending: true })
        .limit(12),
      supabase.from("events").select(EVENT_COLUMNS).lt("starts_at", dayEnd).gt("ends_at", dayStart).order("starts_at"),
      supabase.from("timetable_sessions").select(SESSION_COLUMNS).lte("starts_on", todayKey).gte("ends_on", todayKey),
      supabase.from("session_exceptions").select("session_id,on_date").eq("on_date", todayKey),
      supabase.from("habits").select(HABIT_COLUMNS).is("archived_at", null).order("position"),
      supabase.from("habit_logs").select("habit_id,on_date,status").gte("on_date", addDaysToKey(todayKey, -70)),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "inbox"),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").is("parent_id", null).gte("completed_at", weekStart),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").is("parent_id", null).gte("completed_at", dayStart),
    ]);

  const firstError = [priorities, carryOver, candidates, deadlines, events, sessions, exceptions, habits, logs, inbox, doneWeek, doneToday].find(
    (r) => r.error,
  )?.error;
  if (firstError) throw new Error(`Could not load today: ${firstError.message}`);

  const [decisions, goals, projects, money, workouts, meals, briefing] = await Promise.all([
    getDecisionQueue(3),
    getGoals(),
    getProjects(),
    getMoney(),
    supabase.from("workouts").select("on_date,kind").gte("on_date", weekStartKey(todayKey)),
    supabase.from("meal_plan").select("on_date,recipe_id,note,recipes(title,portions)").in("on_date", [addDaysToKey(todayKey, -1), todayKey]),
    supabase.from("ai_briefings").select("content,created_at").eq("on_date", todayKey).maybeSingle(),
  ]);
  const budget = money.period ? computeBudget(money.period, money.items, money.txns, todayKey) : null;
  type MealRow = { on_date: string; note: string | null; recipes: { title: string; portions: number } | null };
  const mealRows = (meals.data ?? []) as unknown as MealRow[];
  const tonight = mealRows.find((m) => m.on_date === todayKey);
  const lastNight = mealRows.find((m) => m.on_date !== todayKey);
  const activeGoals = goals.filter((g) => g.status === "active");

  return {
    profile,
    nowMs,
    todayKey,
    priorities: (priorities.data ?? []) as Task[],
    carryOver: (carryOver.data ?? []) as Task[],
    candidates: (candidates.data ?? []) as Task[],
    deadlines: (deadlines.data ?? []) as Task[],
    blocks: sortBlocks([
      ...((events.data ?? []) as CalendarEvent[]).map((e) => eventToBlock(e, todayKey)),
      ...expandSessions((sessions.data ?? []) as TimetableSession[], exceptions.data ?? [], todayKey, todayKey, tz),
    ]),
    habits: (habits.data ?? []) as Habit[],
    habitLogs: (logs.data ?? []) as HabitLog[],
    decisions,
    inboxCount: inbox.count ?? 0,
    doneThisWeek: doneWeek.count ?? 0,
    doneToday: doneToday.count ?? 0,
    activeGoals: activeGoals.length,
    quietGoals: activeGoals
      .filter((g) => g.quietDays >= 14)
      .sort((a, b) => b.quietDays - a.quietDays)
      .map((g) => ({ id: g.id, title: g.title, quietDays: g.quietDays })),
    activeProjects: projects.filter((p) => p.status === "active" || p.status === "exploring").length,
    projectsNeedingAttention: projects.filter((p) => p.health === "attention" || p.health === "delayed").length,
    money: budget ? { leftThisWeek: budget.leftThisWeek, allowancePerWeek: budget.allowancePerWeek } : null,
    gym: {
      done: (workouts.data ?? []).length,
      target: profile.gym_target_per_week,
      today: ((workouts.data ?? []).find((w) => w.on_date === todayKey)?.kind as "full" | "minimum" | undefined) ?? null,
    },
    meals: {
      dinner: tonight ? (tonight.recipes?.title ?? tonight.note) : null,
      lunch: lastNight?.recipes && lastNight.recipes.portions >= 2 ? `Leftover ${lastNight.recipes.title}` : null,
    },
    briefing: briefing.data ? { content: briefing.data.content as string, createdAt: briefing.data.created_at as string } : null,
  };
}
