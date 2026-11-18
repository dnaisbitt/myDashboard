"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  dateKeySchema,
  fail,
  firstIssue,
  NOT_SIGNED_IN,
  uuid,
  viewerWithTz,
  type ActionClient,
} from "@/lib/data/action-utils";
import { getActionViewer } from "@/lib/data/viewer";
import { nextOccurrence } from "@/lib/recurrence";
import { addDaysToKey, dateKey, formatTime, localToIso } from "@/lib/time";
import { TASK_COLUMNS, type ActionResult, type Task } from "@/lib/types";

const recurrenceSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(12),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  })
  .nullable();

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

const captureSchema = z.object({
  title: z.string().trim().min(1, "Write something first.").max(300),
  raw: z.string().max(500),
  dueAt: z.iso.datetime().nullable(),
  dueHasTime: z.boolean(),
  asPriority: z.boolean().optional(),
  category: z.string().trim().max(40).nullable().optional(),
});

/** Quick capture. Dated items become open tasks; undated ones wait in the Inbox. */
export async function captureTask(input: z.input<typeof captureSchema>): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;

  const { title, raw, dueAt, dueHasTime, asPriority, category } = parsed.data;
  const row: Record<string, unknown> = {
    title,
    raw_input: raw,
    source: "capture",
    status: dueAt || asPriority ? "open" : "inbox",
    due_at: dueAt,
    due_has_time: dueAt ? dueHasTime : false,
    category: category || null,
  };

  if (asPriority) {
    const todayKey = dateKey(Date.now(), v.tz);
    const rank = await freeRank(v.supabase, todayKey);
    if (!rank) return fail("You already have three priorities today. Drop one first.");
    row.today_date = todayKey;
    row.today_rank = rank;
  }

  const { data, error } = await v.supabase.from("tasks").insert(row).select("id,status").single();
  if (error) return fail("Couldn't save that. Try again.", error);
  refresh();
  return { ok: true, data };
}

const newTaskSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(300),
  projectId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  dueHasTime: z.boolean().optional(),
  plannedOn: dateKeySchema.nullable().optional(),
});

/** Plain create (subtasks, project tasks). Always committed (status open). */
export async function createTask(input: z.input<typeof newTaskSchema>): Promise<ActionResult<{ task: Task }>> {
  const parsed = newTaskSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const d = parsed.data;
  const { data, error } = await v.supabase
    .from("tasks")
    .insert({
      title: d.title,
      project_id: d.projectId ?? null,
      parent_id: d.parentId ?? null,
      due_at: d.dueAt ?? null,
      due_has_time: d.dueAt ? Boolean(d.dueHasTime) : false,
      planned_on: d.plannedOn ?? null,
      status: "open",
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) return fail("Couldn't add that.", error);
  refresh();
  return { ok: true, data: { task: data as Task } };
}

// ---------------------------------------------------------------------------
// Completion (with recurrence)
// ---------------------------------------------------------------------------

/**
 * Completing a recurring task schedules the next one: a fresh open task with the
 * due date moved on by the rule (same time of day). The completed one stays as history.
 */
export async function setTaskDone(id: string, done: boolean): Promise<ActionResult<{ nextDue?: string }>> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;

  const { data: task, error } = await v.supabase
    .from("tasks")
    .update(done ? { status: "done", completed_at: new Date().toISOString() } : { status: "open", completed_at: null })
    .eq("id", id)
    .select(TASK_COLUMNS)
    .single();
  if (error) return fail("Couldn't update the task.", error);

  let nextDue: string | undefined;
  const t = task as Task;
  if (done && t.recurrence && !t.parent_id) {
    const baseKey = t.due_at ? dateKey(t.due_at, v.tz) : dateKey(Date.now(), v.tz);
    const nextKey = nextOccurrence(t.recurrence, baseKey < dateKey(Date.now(), v.tz) ? dateKey(Date.now(), v.tz) : baseKey);
    const time = t.due_at && t.due_has_time ? formatTime(t.due_at, v.tz) : "23:59";
    nextDue = nextKey;
    const { error: insertError } = await v.supabase.from("tasks").insert({
      title: t.title,
      notes: t.notes,
      priority: t.priority,
      category: t.category,
      project_id: t.project_id,
      recurrence: t.recurrence,
      estimate_minutes: t.estimate_minutes,
      due_at: localToIso(nextKey, time, v.tz),
      due_has_time: t.due_has_time,
      status: "open",
      source: "recurring",
    });
    if (insertError) return fail("Done, but the next repeat couldn't be created.", insertError);
  }
  refresh();
  return { ok: true, data: { nextDue } };
}

// ---------------------------------------------------------------------------
// Today's three
// ---------------------------------------------------------------------------

async function freeRank(supabase: ActionClient, todayKey: string): Promise<1 | 2 | 3 | null> {
  const { data } = await supabase.from("tasks").select("today_rank").eq("today_date", todayKey);
  const taken = new Set((data ?? []).map((r) => r.today_rank as number));
  for (const r of [1, 2, 3] as const) if (!taken.has(r)) return r;
  return null;
}

export async function setPriority(id: string, on: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;

  if (!on) {
    const { error } = await v.supabase.from("tasks").update({ today_date: null, today_rank: null }).eq("id", id);
    if (error) return fail("Couldn't change priorities.", error);
    refresh();
    return { ok: true };
  }

  const todayKey = dateKey(Date.now(), v.tz);
  const rank = await freeRank(v.supabase, todayKey);
  if (!rank) return fail("Three is the limit. Finish or drop one first.");
  const { error } = await v.supabase
    .from("tasks")
    .update({ today_date: todayKey, today_rank: rank, status: "open", last_surfaced_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return fail("That slot was just taken. Try again.");
    return fail("Couldn't change priorities.", error);
  }
  refresh();
  return { ok: true };
}

export async function movePriority(id: string, direction: "up" | "down"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;
  const todayKey = dateKey(Date.now(), v.tz);
  const { data } = await v.supabase.from("tasks").select("id,today_rank").eq("today_date", todayKey).order("today_rank");
  const list = (data ?? []) as Array<{ id: string; today_rank: number }>;
  const i = list.findIndex((t) => t.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  const a = list[i];
  const b = list[j];
  // Three-step swap avoids the unique (date, rank) constraint.
  const steps = [
    () => v.supabase.from("tasks").update({ today_rank: null, today_date: null }).eq("id", a.id),
    () => v.supabase.from("tasks").update({ today_rank: a.today_rank }).eq("id", b.id),
    () => v.supabase.from("tasks").update({ today_rank: b.today_rank, today_date: todayKey }).eq("id", a.id),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) return fail("Couldn't reorder.", error);
  }
  refresh();
  return { ok: true };
}

export async function carryOverPriorities(ids: string[]): Promise<ActionResult<{ moved: number }>> {
  const valid = z.array(uuid).max(5).safeParse(ids);
  if (!valid.success) return fail("Unknown tasks.");
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;
  const todayKey = dateKey(Date.now(), v.tz);
  let moved = 0;
  for (const id of valid.data) {
    const rank = await freeRank(v.supabase, todayKey);
    if (!rank) break;
    const { error } = await v.supabase.from("tasks").update({ today_date: todayKey, today_rank: rank }).eq("id", id);
    if (error) return fail("Couldn't carry those over.", error);
    moved++;
  }
  const rest = valid.data.slice(moved);
  if (rest.length) await v.supabase.from("tasks").update({ today_date: null, today_rank: null }).in("id", rest);
  refresh();
  return { ok: true, data: { moved } };
}

export async function dismissCarryOver(ids: string[]): Promise<ActionResult> {
  const valid = z.array(uuid).max(5).safeParse(ids);
  if (!valid.success) return fail("Unknown tasks.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("tasks").update({ today_date: null, today_rank: null }).in("id", valid.data);
  if (error) return fail("Couldn't update.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, "A task needs a title.").max(300),
  notes: z.string().max(5000).nullable(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  dueAt: z.iso.datetime().nullable(),
  dueHasTime: z.boolean(),
  category: z.string().trim().max(40).nullable().optional(),
  projectId: uuid.nullable().optional(),
  recurrence: recurrenceSchema.optional(),
  plannedOn: dateKeySchema.nullable().optional(),
  estimateMinutes: z.number().int().min(5).max(600).nullable().optional(),
});

export async function updateTask(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const d = parsed.data;
  const patch: Record<string, unknown> = {
    title: d.title,
    notes: d.notes?.trim() || null,
    priority: d.priority,
    due_at: d.dueAt,
    due_has_time: d.dueAt ? d.dueHasTime : false,
  };
  if (d.category !== undefined) patch.category = d.category || null;
  if (d.projectId !== undefined) patch.project_id = d.projectId;
  if (d.recurrence !== undefined) patch.recurrence = d.recurrence;
  if (d.plannedOn !== undefined) patch.planned_on = d.plannedOn;
  if (d.estimateMinutes !== undefined) patch.estimate_minutes = d.estimateMinutes;

  const { error } = await v.supabase.from("tasks").update(patch).eq("id", d.id);
  if (error) return fail("Couldn't save changes.", error);
  // Giving an Inbox item a date (or a day to do it) is a decision: it becomes a committed task.
  if (d.dueAt || d.plannedOn) await v.supabase.from("tasks").update({ status: "open" }).eq("id", d.id).eq("status", "inbox");
  refresh();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult<{ task: Task }>> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { data, error } = await v.supabase.from("tasks").delete().eq("id", id).select(TASK_COLUMNS).single();
  if (error) return fail("Couldn't delete the task.", error);
  refresh();
  return { ok: true, data: { task: data as Task } };
}

/** Undo for delete: re-insert the same row (same id). Subtasks are not restored. */
export async function restoreTask(task: Task): Promise<ActionResult> {
  if (!uuid.safeParse(task.id).success) return fail("Unknown task.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("tasks").insert({
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    due_at: task.due_at,
    due_has_time: task.due_has_time,
    today_date: null,
    today_rank: null,
    completed_at: task.completed_at,
    project_id: task.project_id,
    parent_id: task.parent_id,
    category: task.category,
    recurrence: task.recurrence,
    planned_on: task.planned_on,
    estimate_minutes: task.estimate_minutes,
  });
  if (error) return fail("Couldn't restore it.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Decisions: triage, snooze, reschedule, plan
// ---------------------------------------------------------------------------

/** Inbox triage: commit it (open) or decide against it (archived). */
export async function triageTask(id: string, decision: "open" | "archived"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !["open", "archived"].includes(decision)) return fail("Unknown task.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase
    .from("tasks")
    .update({
      status: decision,
      last_surfaced_at: new Date().toISOString(),
      ...(decision === "archived" ? { today_date: null, today_rank: null } : {}),
    })
    .eq("id", id);
  if (error) return fail("Couldn't update.", error);
  refresh();
  return { ok: true };
}

/** "Not now": hide from resurfacing for N days. It comes back after that. */
export async function snoozeTask(id: string, days: number): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !z.number().int().min(1).max(60).safeParse(days).success) return fail("Unknown task.");
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase
    .from("tasks")
    .update({ snoozed_until: addDaysToKey(dateKey(Date.now(), v.tz), days), last_surfaced_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail("Couldn't snooze it.", error);
  refresh();
  return { ok: true };
}

/** Move due dates to a given day, keeping each task's time of day. */
export async function rescheduleTasks(ids: string[], toKey: string): Promise<ActionResult<{ moved: number }>> {
  const valid = z.object({ ids: z.array(uuid).min(1).max(100), toKey: dateKeySchema }).safeParse({ ids, toKey });
  if (!valid.success) return fail("Nothing to move.");
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;
  const { data, error } = await v.supabase.from("tasks").select("id,due_at,due_has_time").in("id", valid.data.ids);
  if (error) return fail("Couldn't load those tasks.", error);
  let moved = 0;
  for (const t of data ?? []) {
    const time = t.due_at && t.due_has_time ? formatTime(t.due_at as string, v.tz) : "23:59";
    const { error: e } = await v.supabase
      .from("tasks")
      .update({ due_at: localToIso(valid.data.toKey, time, v.tz), last_surfaced_at: new Date().toISOString() })
      .eq("id", t.id);
    if (e) return fail("Couldn't move everything.", e);
    moved++;
  }
  refresh();
  return { ok: true, data: { moved } };
}

/** Planner drag: choose the day you'll *do* it (separate from when it's due). */
export async function planTask(id: string, onKey: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (onKey !== null && !dateKeySchema.safeParse(onKey).success)) return fail("Unknown task.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("tasks").update({ planned_on: onKey }).eq("id", id);
  if (error) return fail("Couldn't plan it.", error);
  if (onKey) await v.supabase.from("tasks").update({ status: "open" }).eq("id", id).eq("status", "inbox");
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lookups for dialogs
// ---------------------------------------------------------------------------

export async function getSubtasks(parentId: string): Promise<ActionResult<Task[]>> {
  if (!uuid.safeParse(parentId).success) return fail("Unknown task.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { data, error } = await v.supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });
  if (error) return fail("Couldn't load the checklist.", error);
  return { ok: true, data: (data ?? []) as Task[] };
}

export async function getTaskFormOptions(): Promise<
  ActionResult<{ projects: Array<{ id: string; title: string }>; categories: string[] }>
> {
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const [projects, cats] = await Promise.all([
    v.supabase.from("projects").select("id,title").in("status", ["exploring", "active", "paused"]).order("title"),
    v.supabase.from("tasks").select("category").not("category", "is", null).limit(500),
  ]);
  if (projects.error) return fail("Couldn't load projects.", projects.error);
  const categories = [...new Set((cats.data ?? []).map((r) => r.category as string))].sort();
  return { ok: true, data: { projects: (projects.data ?? []) as Array<{ id: string; title: string }>, categories } };
}

export type SearchHit =
  | { type: "task"; task: Task }
  | { type: "project"; id: string; title: string; status: string }
  | { type: "goal"; id: string; title: string; status: string }
  | { type: "habit"; id: string; title: string };

export async function searchAll(query: string): Promise<ActionResult<SearchHit[]>> {
  const q = z.string().trim().min(1).max(100).safeParse(query);
  if (!q.success) return { ok: true, data: [] };
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  // Escape LIKE wildcards and PostgREST filter syntax characters.
  const term = q.data.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
  const like = `%${term}%`;
  const [tasks, projects, goals, habits] = await Promise.all([
    v.supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .or(`title.ilike.${like},notes.ilike.${like}`)
      .neq("status", "archived")
      .order("status")
      .order("created_at", { ascending: false })
      .limit(15),
    v.supabase.from("projects").select("id,title,status").ilike("title", like).limit(5),
    v.supabase.from("goals").select("id,title,status").ilike("title", like).limit(5),
    v.supabase.from("habits").select("id,title").ilike("title", like).is("archived_at", null).limit(5),
  ]);
  const err = tasks.error ?? projects.error ?? goals.error ?? habits.error;
  if (err) return fail("Search failed.", err);
  return {
    ok: true,
    data: [
      ...(goals.data ?? []).map((g) => ({ type: "goal" as const, id: g.id, title: g.title, status: g.status })),
      ...(projects.data ?? []).map((p) => ({ type: "project" as const, id: p.id, title: p.title, status: p.status })),
      ...(habits.data ?? []).map((h) => ({ type: "habit" as const, id: h.id, title: h.title })),
      ...((tasks.data ?? []) as Task[]).map((t) => ({ type: "task" as const, task: t })),
    ],
  };
}
