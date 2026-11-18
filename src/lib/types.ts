// Row shapes as the app uses them. Mirrors supabase/migrations.
// (Can be replaced by `supabase gen types` output once the project exists.)

export type Tone = "gentle" | "direct" | "quiet";
export type ToneArea = "habits" | "wake" | "deadlines" | "exams" | "optional";

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  tone: Record<ToneArea, Tone>;
  trackers: { calories: boolean; protein: boolean; lifts: boolean };
  ai_enabled: boolean;
};

export type TaskStatus = "inbox" | "open" | "done" | "archived";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: 1 | 2 | 3;
  due_at: string | null;
  due_has_time: boolean;
  today_date: string | null;
  today_rank: 1 | 2 | 3 | null;
  completed_at: string | null;
  project_id: string | null;
  created_at: string;
};

export const TASK_COLUMNS =
  "id,title,notes,status,priority,due_at,due_has_time,today_date,today_rank,completed_at,project_id,created_at";

export type EventKind = "event" | "focus" | "lecture" | "training" | "match" | "gym" | "routine" | "social";

export type CalendarEvent = {
  id: string;
  title: string;
  kind: EventKind;
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
  task_id: string | null;
};

export const EVENT_COLUMNS = "id,title,kind,starts_at,ends_at,location,notes,task_id";

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  event: "Event",
  focus: "Focus block",
  lecture: "Lecture",
  training: "Training",
  match: "Match",
  gym: "Gym",
  routine: "Routine",
  social: "Social",
};

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
