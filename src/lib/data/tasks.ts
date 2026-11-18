import "server-only";
import { TASK_COLUMNS, type Task } from "@/lib/types";
import { getProfile, getViewer } from "./viewer";

/** Inbox, oldest first: the longest-waiting item is the first one you decide on. */
export async function getInbox() {
  const { supabase } = await getViewer();
  const profile = await getProfile();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("status", "inbox")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`Could not load your Inbox: ${error.message}`);
  return { tasks: (data ?? []) as Task[], tz: profile.timezone, nowMs: Date.now() };
}

export async function getOpenTasks() {
  const { supabase } = await getViewer();
  const profile = await getProfile();
  const [open, done] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("status", "open")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("tasks").select(TASK_COLUMNS).eq("status", "done").order("completed_at", { ascending: false }).limit(10),
  ]);
  const error = open.error ?? done.error;
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return { open: (open.data ?? []) as Task[], recentlyDone: (done.data ?? []) as Task[], tz: profile.timezone, nowMs: Date.now() };
}
