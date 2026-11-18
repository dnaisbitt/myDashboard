import "server-only";
import { TASK_COLUMNS, type Task } from "@/lib/types";
import { getDecisionQueue } from "./plans";
import { getProfile, getViewer } from "./viewer";

/** Inbox, oldest first, plus older open tasks that have gone quiet. */
export async function getInbox() {
  const { supabase } = await getViewer();
  const profile = await getProfile();
  const [inbox, queue] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("status", "inbox").order("created_at", { ascending: true }).limit(200),
    getDecisionQueue(20),
  ]);
  if (inbox.error) throw new Error(`Could not load your Inbox: ${inbox.error.message}`);
  const stale = queue.filter((t) => t.status === "open");
  return { tasks: (inbox.data ?? []) as Task[], stale, tz: profile.timezone, nowMs: Date.now() };
}

/** Everything the Tasks views filter over, in one read (views/filters run client-side). */
export async function getTaskBoard() {
  const { supabase } = await getViewer();
  const profile = await getProfile();
  const [open, done, projects, subtasks] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .in("status", ["open", "inbox"])
      .is("parent_id", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("tasks").select(TASK_COLUMNS).eq("status", "done").is("parent_id", null).order("completed_at", { ascending: false }).limit(60),
    supabase.from("projects").select("id,title,status").order("title"),
    supabase.from("tasks").select("parent_id,status").not("parent_id", "is", null),
  ]);
  const error = open.error ?? done.error ?? projects.error ?? subtasks.error;
  if (error) throw new Error(`Could not load tasks: ${error.message}`);

  const checklist: Record<string, { done: number; total: number }> = {};
  for (const s of subtasks.data ?? []) {
    const c = (checklist[s.parent_id as string] ??= { done: 0, total: 0 });
    c.total++;
    if (s.status === "done") c.done++;
  }
  return {
    open: (open.data ?? []) as Task[],
    done: (done.data ?? []) as Task[],
    projects: (projects.data ?? []) as Array<{ id: string; title: string; status: string }>,
    checklist,
    tz: profile.timezone,
    nowMs: Date.now(),
  };
}
