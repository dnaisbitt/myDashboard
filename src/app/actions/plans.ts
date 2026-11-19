"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dateKeySchema, fail, firstIssue, NOT_SIGNED_IN, uuid } from "@/lib/data/action-utils";
import { getActionViewer } from "@/lib/data/viewer";
import { addDaysToKey, dateKey, DEFAULT_TZ } from "@/lib/time";
import { HABIT_COLUMNS, PROFILE_COLUMNS, type ActionResult, type Habit, type HabitLog, type Profile } from "@/lib/types";

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const goalSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1, "Name the goal.").max(200),
  description: z.string().trim().max(4000).nullable(),
  horizon: z.enum(["short", "medium", "long"]),
  area: z.enum(["personal", "professional", "financial", "fitness"]),
  target: z.string().trim().max(300).nullable(),
  deadline: dateKeySchema.nullable(),
  status: z.enum(["active", "paused", "achieved", "dropped"]),
  progress: z.number().int().min(0).max(100),
});

export async function saveGoal(input: z.input<typeof goalSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { id, ...g } = parsed.data;
  const row = { ...g, description: g.description || null, target: g.target || null };
  const res = id
    ? await v.supabase.from("goals").update(row).eq("id", id).select("id").single()
    : await v.supabase.from("goals").insert(row).select("id").single();
  if (res.error) return fail("Couldn't save the goal.", res.error);
  refresh();
  return { ok: true, data: { id: res.data.id } };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown goal.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("goals").delete().eq("id", id);
  if (error) return fail("Couldn't delete the goal.", error);
  refresh();
  return { ok: true };
}

const updateSchema = z.object({
  goalId: uuid,
  body: z.string().trim().min(1, "Write a line about how it's going.").max(2000),
  progress: z.number().int().min(0).max(100).nullable(),
});

/** A dated status note; optionally moves the goal's progress too. */
export async function addGoalUpdate(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { goalId, body, progress } = parsed.data;
  const { error } = await v.supabase.from("goal_updates").insert({ goal_id: goalId, body, progress });
  if (error) return fail("Couldn't add the update.", error);
  if (progress !== null) await v.supabase.from("goals").update({ progress }).eq("id", goalId);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const projectSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1, "Name the project.").max(200),
  description: z.string().trim().max(4000).nullable(),
  notes: z.string().max(20000).nullable().optional(),
  deadline: dateKeySchema.nullable(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: z.enum(["exploring", "active", "paused", "done", "dropped"]),
  goalId: uuid.nullable(),
});

export async function saveProject(input: z.input<typeof projectSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { id, goalId, ...p } = parsed.data;
  const row: Record<string, unknown> = { ...p, description: p.description || null, goal_id: goalId };
  if (p.notes === undefined) delete row.notes;
  const res = id
    ? await v.supabase.from("projects").update(row).eq("id", id).select("id").single()
    : await v.supabase.from("projects").insert(row).select("id").single();
  if (res.error) return fail("Couldn't save the project.", res.error);
  refresh();
  return { ok: true, data: { id: res.data.id } };
}

export async function saveProjectNotes(id: string, notes: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || notes.length > 20000) return fail("Couldn't save notes.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("projects").update({ notes: notes || null }).eq("id", id);
  if (error) return fail("Couldn't save notes.", error);
  refresh();
  return { ok: true };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown project.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  // Tasks are kept (unlinked) by the foreign key's ON DELETE SET NULL.
  const { error } = await v.supabase.from("projects").delete().eq("id", id);
  if (error) return fail("Couldn't delete the project.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Milestones (goal or project)
// ---------------------------------------------------------------------------

const milestoneSchema = z
  .object({
    goalId: uuid.nullable(),
    projectId: uuid.nullable(),
    title: z.string().trim().min(1, "Name the milestone.").max(200),
    dueOn: dateKeySchema.nullable(),
  })
  .refine((m) => (m.goalId === null) !== (m.projectId === null), { message: "Milestone needs one parent." });

export async function addMilestone(input: z.input<typeof milestoneSchema>): Promise<ActionResult> {
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const m = parsed.data;
  const { error } = await v.supabase
    .from("milestones")
    .insert({ goal_id: m.goalId, project_id: m.projectId, title: m.title, due_on: m.dueOn, position: Date.now() % 2147483647 });
  if (error) return fail("Couldn't add the milestone.", error);
  refresh();
  return { ok: true };
}

export async function toggleMilestone(id: string, done: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown milestone.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("milestones").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) return fail("Couldn't update the milestone.", error);
  refresh();
  return { ok: true };
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown milestone.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("milestones").delete().eq("id", id);
  if (error) return fail("Couldn't delete the milestone.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

const habitSchema = z
  .object({
    id: uuid.optional(),
    title: z.string().trim().min(1, "Name the habit.").max(120),
    kind: z.enum(["build", "check_in"]),
    frequency: z.enum(["daily", "weekly", "days"]),
    targetPerWeek: z.number().int().min(1).max(7).nullable(),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).nullable(),
    partOfDay: z.enum(["morning", "evening", "any"]),
    minimumVersion: z.string().trim().max(200).nullable(),
    goalId: uuid.nullable(),
  })
  .refine((h) => h.frequency !== "weekly" || h.targetPerWeek, { message: "How many times a week?" })
  .refine((h) => h.frequency !== "days" || (h.weekdays && h.weekdays.length > 0), { message: "Pick at least one day." });

export async function saveHabit(input: z.input<typeof habitSchema>): Promise<ActionResult> {
  const parsed = habitSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const h = parsed.data;
  const row = {
    title: h.title,
    kind: h.kind,
    frequency: h.frequency,
    target_per_week: h.frequency === "weekly" ? h.targetPerWeek : null,
    weekdays: h.frequency === "days" ? [...new Set(h.weekdays)].sort() : null,
    part_of_day: h.partOfDay,
    minimum_version: h.minimumVersion || null,
    goal_id: h.goalId,
  };
  const { error } = h.id
    ? await v.supabase.from("habits").update(row).eq("id", h.id)
    : await v.supabase.from("habits").insert({ ...row, position: Math.floor(Date.now() / 1000) % 2147483647 });
  if (error) return fail("Couldn't save the habit.", error);
  refresh();
  return { ok: true };
}

export async function archiveHabit(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown habit.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("habits").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) return fail("Couldn't update the habit.", error);
  refresh();
  return { ok: true };
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown habit.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("habits").delete().eq("id", id);
  if (error) return fail("Couldn't delete the habit.", error);
  refresh();
  return { ok: true };
}

/** One tap: log a day as done / minimum version / honest miss, or clear it (null). */
export async function logHabit(habitId: string, onDate: string, status: "done" | "minimum" | "missed" | null): Promise<ActionResult> {
  if (!uuid.safeParse(habitId).success || !dateKeySchema.safeParse(onDate).success) return fail("Unknown habit.");
  if (status !== null && !["done", "minimum", "missed"].includes(status)) return fail("Unknown status.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } =
    status === null
      ? await v.supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("on_date", onDate)
      : await v.supabase.from("habit_logs").upsert({ habit_id: habitId, on_date: onDate, status }, { onConflict: "habit_id,on_date" });
  if (error) return fail("Couldn't log that.", error);
  refresh();
  return { ok: true };
}

/**
 * Starter habits from the plan, created only when you tap "Add these".
 * Nothing is pre-filled behind your back.
 */
export async function addStarterHabits(keys: string[]): Promise<ActionResult<{ added: number }>> {
  const STARTERS: Record<string, Record<string, unknown>> = {
    gym: { title: "Gym", kind: "build", frequency: "weekly", target_per_week: 4, part_of_day: "any", minimum_version: "30 minutes, any session counts" },
    phone: { title: "Phone-down check-in", kind: "check_in", frequency: "daily", part_of_day: "evening", minimum_version: null },
    bedtime: { title: "In bed on time", kind: "build", frequency: "daily", part_of_day: "evening", minimum_version: null },
    wake: { title: "Up at my wake time", kind: "build", frequency: "daily", part_of_day: "morning", minimum_version: null },
  };
  const chosen = z.array(z.enum(["gym", "phone", "bedtime", "wake"])).min(1).max(4).safeParse(keys);
  if (!chosen.success) return fail("Pick at least one.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const rows = chosen.data.map((k, i) => ({ ...STARTERS[k], position: i }));
  const { error } = await v.supabase.from("habits").insert(rows);
  if (error) return fail("Couldn't add those habits.", error);
  refresh();
  return { ok: true, data: { added: rows.length } };
}

/** For the phone's Log sheet: habits with streak history, plus today's body check-ins. */
export async function getLogSheetData(): Promise<
  ActionResult<{
    habits: Habit[];
    logs: HabitLog[];
    todayKey: string;
    profile: Profile;
    workout: "full" | "minimum" | null;
    checkin: { on_date: string; ate_well: boolean | null; protein_hit: boolean | null; calories: number | null } | null;
    categories: string[];
  }>
> {
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { data: profile, error: pErr } = await v.supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", v.userId).maybeSingle();
  if (pErr || !profile) return fail("Couldn't load your profile.", pErr);
  const todayKey = dateKey(Date.now(), (profile.timezone as string | undefined) ?? DEFAULT_TZ);
  const [habits, logs, workout, checkin, recent] = await Promise.all([
    v.supabase.from("habits").select(HABIT_COLUMNS).is("archived_at", null).order("position"),
    v.supabase.from("habit_logs").select("habit_id,on_date,status").gte("on_date", addDaysToKey(todayKey, -70)),
    v.supabase.from("workouts").select("kind").eq("on_date", todayKey).maybeSingle(),
    v.supabase.from("daily_checkins").select("on_date,ate_well,protein_hit,calories").eq("on_date", todayKey).maybeSingle(),
    v.supabase.from("transactions").select("category").gt("amount_pence", 0).order("created_at", { ascending: false }).limit(30),
  ]);
  const err = habits.error ?? logs.error ?? workout.error ?? checkin.error ?? recent.error;
  if (err) return fail("Couldn't load your logs.", err);
  return {
    ok: true,
    data: {
      habits: (habits.data ?? []) as Habit[],
      logs: (logs.data ?? []) as HabitLog[],
      todayKey,
      profile: profile as Profile,
      workout: (workout.data?.kind as "full" | "minimum" | undefined) ?? null,
      checkin: checkin.data ?? null,
      categories: [...new Set((recent.data ?? []).map((r) => r.category as string))].slice(0, 4),
    },
  };
}
