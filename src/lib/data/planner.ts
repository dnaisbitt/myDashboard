import "server-only";
import { eventToBlock, expandSessions, sortBlocks, type Block } from "@/lib/schedule";
import { addDaysToKey, dateKey, startOfLocalDay } from "@/lib/time";
import {
  EVENT_COLUMNS,
  SESSION_COLUMNS,
  TASK_COLUMNS,
  type CalendarEvent,
  type FocusOutcome,
  type FocusPlace,
  type Task,
  type TimetableSession,
} from "@/lib/types";
import { getProfile, getViewer } from "./viewer";

export type RangeData = {
  blocks: Block[];
  /** Open tasks due or planned inside the range. */
  tasks: Task[];
};

/** Everything on the calendar between two local date keys (inclusive). */
export async function getRange(fromKey: string, toKey: string): Promise<RangeData> {
  const { supabase } = await getViewer();
  const { timezone: tz } = await getProfile();
  const start = startOfLocalDay(fromKey, tz);
  const end = startOfLocalDay(addDaysToKey(toKey, 1), tz);

  const [events, sessions, exceptions, due, planned] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).lt("starts_at", end).gt("ends_at", start).order("starts_at"),
    supabase.from("timetable_sessions").select(SESSION_COLUMNS).lte("starts_on", toKey).gte("ends_on", fromKey),
    supabase.from("session_exceptions").select("session_id,on_date").gte("on_date", fromKey).lte("on_date", toKey),
    supabase.from("tasks").select(TASK_COLUMNS).in("status", ["open", "inbox"]).is("parent_id", null).gte("due_at", start).lt("due_at", end),
    supabase.from("tasks").select(TASK_COLUMNS).in("status", ["open", "inbox"]).is("parent_id", null).gte("planned_on", fromKey).lte("planned_on", toKey),
  ]);
  const err = events.error ?? sessions.error ?? exceptions.error ?? due.error ?? planned.error;
  if (err) throw new Error(`Could not load your calendar: ${err.message}`);

  const blocks = sortBlocks([
    ...((events.data ?? []) as CalendarEvent[]).map((e) => eventToBlock(e, dateKey(e.starts_at, tz))),
    ...expandSessions((sessions.data ?? []) as TimetableSession[], exceptions.data ?? [], fromKey, toKey, tz),
  ]);
  const byId = new Map<string, Task>();
  for (const t of [...((due.data ?? []) as Task[]), ...((planned.data ?? []) as Task[])]) byId.set(t.id, t);
  return { blocks, tasks: [...byId.values()] };
}

export async function getTimetable() {
  const { supabase } = await getViewer();
  const { data, error } = await supabase.from("timetable_sessions").select(SESSION_COLUMNS).order("weekday").order("start_time");
  if (error) throw new Error(`Could not load your timetable: ${error.message}`);
  return (data ?? []) as TimetableSession[];
}

/** Unfinished work that needs a new day: open tasks overdue before today. */
export async function getOverdue(todayKey: string) {
  const { supabase } = await getViewer();
  const { timezone: tz } = await getProfile();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("status", "open")
    .is("parent_id", null)
    .lt("due_at", startOfLocalDay(todayKey, tz))
    .order("due_at")
    .limit(50);
  if (error) throw new Error(`Could not load overdue tasks: ${error.message}`);
  return (data ?? []) as Task[];
}

export type FocusStat = { place: FocusPlace | "untagged"; blocks: number; minutes: number; stayed: number; answered: number };

/** Where you actually get work done: focus blocks by place over the last N days. */
export async function getFocusStats(days = 28): Promise<FocusStat[]> {
  const { supabase } = await getViewer();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("place,outcome,starts_at,ends_at")
    .eq("kind", "focus")
    .gte("starts_at", since)
    .lt("ends_at", new Date().toISOString());
  if (error) throw new Error(`Could not load focus stats: ${error.message}`);
  const map = new Map<string, FocusStat>();
  for (const e of (data ?? []) as Array<{ place: FocusPlace | null; outcome: FocusOutcome | null; starts_at: string; ends_at: string }>) {
    const place = e.place ?? "untagged";
    const s = map.get(place) ?? { place, blocks: 0, minutes: 0, stayed: 0, answered: 0 };
    s.blocks++;
    s.minutes += Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000);
    if (e.outcome) s.answered++;
    if (e.outcome === "stayed") s.stayed++;
    else if (e.outcome === "partly") s.stayed += 0.5;
    map.set(place, s);
  }
  return [...map.values()].sort((a, b) => b.blocks - a.blocks);
}
