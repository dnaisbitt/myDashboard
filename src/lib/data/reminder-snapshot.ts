import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isScheduled } from "@/lib/habits";
import type { ReminderPrefs, Snapshot } from "@/lib/reminders";
import { expandSessions } from "@/lib/schedule";
import { addDaysToKey, dateKey, describeDue, formatTime, isoWeekday, localMinutes, startOfLocalDay } from "@/lib/time";
import type { Habit, Tone, ToneArea, TimetableSession } from "@/lib/types";

export type ReminderProfile = {
  id: string;
  timezone: string;
  tone: Record<ToneArea, Tone>;
  reminders: ReminderPrefs;
  bedtime_target: string | null;
};

/**
 * Everything the reminder rules need, for one user, at one moment.
 * Works with the admin client (reminder job) or a user's session client (Settings
 * preview): every query filters by user_id explicitly so it is safe either way.
 */
export async function buildSnapshot(db: SupabaseClient, profile: ReminderProfile, nowMs: number): Promise<Snapshot> {
  const uid = profile.id;
  const tz = profile.timezone;
  const today = dateKey(nowMs, tz);
  const tomorrow = addDaysToKey(today, 1);
  const horizon = startOfLocalDay(addDaysToKey(today, 4), tz);

  const [prio, due, habits, logs, sessions, exceptions, gymEvents, booked, goals, updates, projects, periods] = await Promise.all([
    db.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("today_date", today),
    db
      .from("tasks")
      .select("id,title,due_at,due_has_time,planned_on,category")
      .eq("user_id", uid)
      .in("status", ["open", "inbox"])
      .is("parent_id", null)
      .not("due_at", "is", null)
      .lt("due_at", horizon)
      .order("due_at")
      .limit(50),
    db.from("habits").select("id,title,kind,frequency,weekdays,part_of_day,minimum_version").eq("user_id", uid).is("archived_at", null),
    db.from("habit_logs").select("habit_id").eq("user_id", uid).eq("on_date", today),
    db.from("timetable_sessions").select("id,title,kind,weekday,start_time,end_time,location,starts_on,ends_on").eq("user_id", uid).eq("kind", "gym"),
    db.from("session_exceptions").select("session_id,on_date").eq("user_id", uid).eq("on_date", tomorrow),
    db
      .from("events")
      .select("starts_at")
      .eq("user_id", uid)
      .eq("kind", "gym")
      .gte("starts_at", startOfLocalDay(tomorrow, tz))
      .lt("starts_at", startOfLocalDay(addDaysToKey(tomorrow, 1), tz))
      .order("starts_at")
      .limit(1),
    db.from("gym_bookings").select("on_date").eq("user_id", uid).eq("on_date", tomorrow).maybeSingle(),
    db.from("goals").select("id,title,updated_at").eq("user_id", uid).eq("status", "active"),
    db.from("goal_updates").select("goal_id,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
    db.from("projects").select("goal_id,updated_at").eq("user_id", uid).not("goal_id", "is", null),
    db.from("budget_periods").select("id", { count: "exact", head: true }).eq("user_id", uid),
  ]);
  const err = [prio, due, habits, logs, sessions, exceptions, gymEvents, booked, goals, updates, projects, periods].find((r) => r.error)?.error;
  if (err) throw new Error(`Reminder snapshot failed: ${err.message}`);

  const deadlines: Snapshot["deadlines"] = [];
  const overdue: Snapshot["overdue"] = [];
  for (const t of due.data ?? []) {
    const info = describeDue(t.due_at as string, t.due_has_time as boolean, nowMs, tz);
    if (info.overdue) overdue.push({ id: t.id as string, title: t.title as string });
    else
      deadlines.push({
        id: t.id as string,
        title: t.title as string,
        daysAway: info.daysAway,
        label: info.label.split(" · ")[0],
        planned: Boolean(t.planned_on),
        exam: /exam/i.test(`${t.title} ${t.category ?? ""}`),
      });
  }

  const loggedIds = new Set((logs.data ?? []).map((l) => l.habit_id as string));
  const gymSession = expandSessions((sessions.data ?? []) as TimetableSession[], exceptions.data ?? [], tomorrow, tomorrow, tz).find((b) => !b.cancelled);
  const gymStart = gymSession?.startsAt ?? (gymEvents.data?.[0]?.starts_at as string | undefined);

  const lastTouch = new Map<string, string>();
  const touch = (id: string | null, at: string) => {
    if (id && (!lastTouch.has(id) || lastTouch.get(id)! < at)) lastTouch.set(id, at);
  };
  for (const g of goals.data ?? []) touch(g.id as string, g.updated_at as string);
  for (const u of updates.data ?? []) touch(u.goal_id as string, u.created_at as string);
  for (const p of projects.data ?? []) touch(p.goal_id as string, p.updated_at as string);

  return {
    nowMin: localMinutes(nowMs, tz),
    todayKey: today,
    isoWeekday: isoWeekday(today),
    dayOfMonth: Number(today.slice(8)),
    tone: profile.tone,
    prefs: profile.reminders ?? {},
    bedtimeTarget: profile.bedtime_target ? profile.bedtime_target.slice(0, 5) : null,
    prioritiesPicked: prio.count ?? 0,
    deadlines,
    overdue,
    habits: ((habits.data ?? []) as Habit[]).map((h) => ({
      id: h.id,
      title: h.title,
      kind: h.kind,
      part: h.part_of_day,
      due: isScheduled(h, today),
      logged: loggedIds.has(h.id),
      minimum: h.minimum_version,
    })),
    gymTomorrow: gymStart ? { time: formatTime(gymStart, tz), booked: Boolean(booked.data) } : null,
    quietGoals: (goals.data ?? [])
      .map((g) => ({ id: g.id as string, title: g.title as string, days: Math.floor((nowMs - Date.parse(lastTouch.get(g.id as string)!)) / 86_400_000) }))
      .filter((g) => g.days >= 14)
      .sort((a, b) => b.days - a.days),
    hasBudget: (periods.count ?? 0) > 0,
  };
}
