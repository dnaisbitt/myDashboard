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
  wake_current: string | null;
  wake_target: string | null;
  wake_step_minutes: number;
  wake_plan_started: string | null;
  bedtime_target: string | null;
  gym_target_per_week: number;
  gym_quiet_times: string | null;
};

export const PROFILE_COLUMNS =
  "id,display_name,timezone,tone,trackers,ai_enabled,wake_current,wake_target,wake_step_minutes,wake_plan_started,bedtime_target,gym_target_per_week,gym_quiet_times";

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
  parent_id: string | null;
  category: string | null;
  recurrence: Recurrence | null;
  planned_on: string | null;
  estimate_minutes: number | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
};

export type Recurrence = { freq: "daily" | "weekly" | "monthly"; interval: number; weekdays?: number[] };

export const TASK_COLUMNS =
  "id,title,notes,status,priority,due_at,due_has_time,today_date,today_rank,completed_at,project_id,parent_id,category,recurrence,planned_on,estimate_minutes,snoozed_until,created_at,updated_at";

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
  place: FocusPlace | null;
  outcome: FocusOutcome | null;
};

export type FocusPlace = "library" | "home" | "group_room" | "other";
export type FocusOutcome = "stayed" | "partly" | "drifted";
export const PLACE_LABEL: Record<FocusPlace, string> = {
  library: "Library",
  home: "Home",
  group_room: "Group room",
  other: "Elsewhere",
};

export const EVENT_COLUMNS = "id,title,kind,starts_at,ends_at,location,notes,task_id,place,outcome";

export type SessionKind = "lecture" | "lab" | "seminar" | "tutorial" | "training" | "match" | "gym" | "other";
export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  lecture: "Lecture",
  lab: "Lab",
  seminar: "Seminar",
  tutorial: "Tutorial",
  training: "Training",
  match: "Match",
  gym: "Gym",
  other: "Other",
};

export type TimetableSession = {
  id: string;
  title: string;
  kind: SessionKind;
  weekday: number; // ISO, Mon = 1
  start_time: string; // "09:00:00"
  end_time: string;
  location: string | null;
  starts_on: string;
  ends_on: string;
};
export const SESSION_COLUMNS = "id,title,kind,weekday,start_time,end_time,location,starts_on,ends_on";

export type Project = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  deadline: string | null;
  priority: 1 | 2 | 3;
  status: "exploring" | "active" | "paused" | "done" | "dropped";
  goal_id: string | null;
  created_at: string;
  updated_at: string;
};
export const PROJECT_COLUMNS = "id,title,description,notes,deadline,priority,status,goal_id,created_at,updated_at";

export type GoalArea = "personal" | "professional" | "financial" | "fitness";
export type Goal = {
  id: string;
  title: string;
  description: string | null;
  horizon: "short" | "medium" | "long";
  area: GoalArea;
  target: string | null;
  deadline: string | null;
  status: "active" | "paused" | "achieved" | "dropped";
  progress: number;
  created_at: string;
  updated_at: string;
};
export const GOAL_COLUMNS = "id,title,description,horizon,area,target,deadline,status,progress,created_at,updated_at";

export type Milestone = {
  id: string;
  goal_id: string | null;
  project_id: string | null;
  title: string;
  due_on: string | null;
  done_at: string | null;
  position: number;
};
export const MILESTONE_COLUMNS = "id,goal_id,project_id,title,due_on,done_at,position";

export type GoalUpdate = { id: string; goal_id: string; body: string; progress: number | null; created_at: string };

export type Habit = {
  id: string;
  title: string;
  kind: "build" | "check_in";
  frequency: "daily" | "weekly" | "days";
  target_per_week: number | null;
  weekdays: number[] | null;
  part_of_day: "morning" | "evening" | "any";
  minimum_version: string | null;
  goal_id: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
};
export const HABIT_COLUMNS =
  "id,title,kind,frequency,target_per_week,weekdays,part_of_day,minimum_version,goal_id,position,archived_at,created_at";

export type HabitLog = { habit_id: string; on_date: string; status: "done" | "minimum" | "missed" };

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
