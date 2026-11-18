import "server-only";
import { addDaysToKey, dateKey, startOfLocalDay } from "@/lib/time";
import { EVENT_COLUMNS, TASK_COLUMNS, type CalendarEvent, type Profile, type Task } from "@/lib/types";
import { getProfile, getViewer } from "./viewer";

export type TodayData = {
  profile: Profile;
  nowMs: number;
  todayKey: string;
  priorities: Task[];
  carryOver: Task[];
  candidates: Task[];
  deadlines: Task[];
  events: CalendarEvent[];
  inboxCount: number;
  doneThisWeek: number;
  doneToday: number;
  activeGoals: number;
  activeProjects: number;
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
  // Monday-based week start in local time
  const weekday = (new Date(`${todayKey}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = startOfLocalDay(addDaysToKey(todayKey, -weekday), tz);

  const [priorities, carryOver, candidates, deadlines, events, inbox, doneWeek, doneToday, goals, projects] =
    await Promise.all([
      supabase.from("tasks").select(TASK_COLUMNS).eq("today_date", todayKey).order("today_rank"),
      supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .lt("today_date", todayKey)
        .eq("status", "open")
        .order("today_date", { ascending: false })
        .limit(5),
      supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("status", "open")
        .or(`today_date.is.null,today_date.neq.${todayKey}`)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .in("status", ["open", "inbox"])
        .not("due_at", "is", null)
        .lt("due_at", horizon)
        .order("due_at", { ascending: true })
        .limit(12),
      supabase
        .from("events")
        .select(EVENT_COLUMNS)
        .lt("starts_at", dayEnd)
        .gt("ends_at", dayStart)
        .order("starts_at", { ascending: true }),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "inbox"),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").gte("completed_at", weekStart),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").gte("completed_at", dayStart),
      supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("projects").select("id", { count: "exact", head: true }).in("status", ["active", "exploring"]),
    ]);

  const firstError = [priorities, carryOver, candidates, deadlines, events, inbox, doneWeek, doneToday, goals, projects].find(
    (r) => r.error,
  )?.error;
  if (firstError) throw new Error(`Could not load today: ${firstError.message}`);

  return {
    profile,
    nowMs,
    todayKey,
    priorities: (priorities.data ?? []) as Task[],
    carryOver: (carryOver.data ?? []) as Task[],
    candidates: (candidates.data ?? []) as Task[],
    deadlines: (deadlines.data ?? []) as Task[],
    events: (events.data ?? []) as CalendarEvent[],
    inboxCount: inbox.count ?? 0,
    doneThisWeek: doneWeek.count ?? 0,
    doneToday: doneToday.count ?? 0,
    activeGoals: goals.count ?? 0,
    activeProjects: projects.count ?? 0,
  };
}
