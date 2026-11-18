"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getActionViewer } from "@/lib/data/viewer";
import { dateKey, DEFAULT_TZ } from "@/lib/time";
import { TASK_COLUMNS, type ActionResult, type Task } from "@/lib/types";

const NOT_SIGNED_IN = { ok: false, error: "You're signed out. Sign in again." } as const;
const uuid = z.uuid();

async function viewerWithTz() {
  const v = await getActionViewer();
  if (!v) return null;
  const { data } = await v.supabase.from("profiles").select("timezone").eq("id", v.userId).maybeSingle();
  return { ...v, tz: (data?.timezone as string | undefined) ?? DEFAULT_TZ };
}

function fail(message: string, detail?: { message: string }): { ok: false; error: string } {
  if (detail) console.error(message, detail.message);
  return { ok: false, error: message };
}

// ---------------------------------------------------------------------------

const captureSchema = z.object({
  title: z.string().trim().min(1, "Write something first.").max(300),
  raw: z.string().max(500),
  dueAt: z.iso.datetime().nullable(),
  dueHasTime: z.boolean(),
  asPriority: z.boolean().optional(),
});

/** Quick capture. Dated items become open tasks; undated ones wait in the Inbox. */
export async function captureTask(input: z.input<typeof captureSchema>): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;

  const { title, raw, dueAt, dueHasTime, asPriority } = parsed.data;
  const row: Record<string, unknown> = {
    title,
    raw_input: raw,
    source: "capture",
    status: dueAt || asPriority ? "open" : "inbox",
    due_at: dueAt,
    due_has_time: dueAt ? dueHasTime : false,
  };

  if (asPriority) {
    const rank = await freeRank(v.supabase, dateKey(Date.now(), v.tz));
    if (!rank) return fail("You already have three priorities today. Drop one first.");
    row.today_date = dateKey(Date.now(), v.tz);
    row.today_rank = rank;
  }

  const { data, error } = await v.supabase.from("tasks").insert(row).select("id,status").single();
  if (error) return fail("Couldn't save that. Try again.", error);
  refresh();
  return { ok: true, data };
}

// ---------------------------------------------------------------------------

export async function setTaskDone(id: string, done: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase
    .from("tasks")
    .update(done ? { status: "done", completed_at: new Date().toISOString() } : { status: "open", completed_at: null })
    .eq("id", id);
  if (error) return fail("Couldn't update the task.", error);
  refresh();
  return { ok: true };
}

type Client = NonNullable<Awaited<ReturnType<typeof getActionViewer>>>["supabase"];

async function freeRank(supabase: Client, todayKey: string): Promise<1 | 2 | 3 | null> {
  const { data } = await supabase.from("tasks").select("today_rank").eq("today_date", todayKey);
  const taken = new Set((data ?? []).map((r) => r.today_rank as number));
  for (const r of [1, 2, 3] as const) if (!taken.has(r)) return r;
  return null;
}

/** Add to / remove from today's top three. */
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
    .update({ today_date: todayKey, today_rank: rank, status: "open" })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return fail("That slot was just taken. Try again.");
    return fail("Couldn't change priorities.", error);
  }
  refresh();
  return { ok: true };
}

/** Swap a priority with the one above/below it. */
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
    v.supabase.from("tasks").update({ today_rank: null, today_date: null }).eq("id", a.id),
    v.supabase.from("tasks").update({ today_rank: a.today_rank }).eq("id", b.id),
    v.supabase.from("tasks").update({ today_rank: b.today_rank, today_date: todayKey }).eq("id", a.id),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) return fail("Couldn't reorder.", error);
  }
  refresh();
  return { ok: true };
}

/** Bring yesterday's unfinished priorities into today (as many as fit). */
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
  // Anything that didn't fit loses its stale priority flag but stays as an open task.
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

const updateSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, "A task needs a title.").max(300),
  notes: z.string().max(5000).nullable(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  dueAt: z.iso.datetime().nullable(),
  dueHasTime: z.boolean(),
});

export async function updateTask(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { id, title, notes, priority, dueAt, dueHasTime } = parsed.data;
  const { error } = await v.supabase
    .from("tasks")
    .update({ title, notes: notes?.trim() || null, priority, due_at: dueAt, due_has_time: dueAt ? dueHasTime : false })
    .eq("id", id);
  if (error) return fail("Couldn't save changes.", error);
  // Giving an Inbox item a date is a decision: it becomes a committed task.
  if (dueAt) await v.supabase.from("tasks").update({ status: "open" }).eq("id", id).eq("status", "inbox");
  refresh();
  return { ok: true };
}

/** Inbox triage: commit it (open) or decide against it (archived). */
export async function triageTask(id: string, decision: "open" | "archived"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !["open", "archived"].includes(decision)) return fail("Unknown task.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase
    .from("tasks")
    .update({ status: decision, last_surfaced_at: new Date().toISOString(), ...(decision === "archived" ? { today_date: null, today_rank: null } : {}) })
    .eq("id", id);
  if (error) return fail("Couldn't update.", error);
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

/** Undo for delete: re-insert the same row (same id). */
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
    // Don't restore a rank that may have been taken since.
    today_date: null,
    today_rank: null,
    completed_at: task.completed_at,
    project_id: task.project_id,
  });
  if (error) return fail("Couldn't restore it.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------

export async function searchTasks(query: string): Promise<ActionResult<Task[]>> {
  const q = z.string().trim().min(1).max(100).safeParse(query);
  if (!q.success) return { ok: true, data: [] };
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  // Escape LIKE wildcards and PostgREST filter syntax characters.
  const term = q.data.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
  const { data, error } = await v.supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .or(`title.ilike.%${term}%,notes.ilike.%${term}%`)
    .neq("status", "archived")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return fail("Search failed.", error);
  return { ok: true, data: (data ?? []) as Task[] };
}
