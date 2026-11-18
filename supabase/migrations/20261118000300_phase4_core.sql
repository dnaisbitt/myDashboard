-- Phase 4: timetable, focus blocks, milestones, goal updates, habits, task extras.
-- Same rules as before: owner-only RLS on every table, composite (id, user_id)
-- foreign keys so links never cross users, explicit grants to `authenticated`.

-- ---------------------------------------------------------------------------
-- Tasks: category, recurrence, planned day, estimate, snooze (resurfacing)
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column category text check (char_length(category) between 1 and 40),
  -- {"freq":"daily"|"weekly"|"monthly","interval":1..12,"weekdays":[1..7]} (ISO weekdays, Mon=1)
  add column recurrence jsonb check (
    recurrence is null or (
      recurrence ->> 'freq' in ('daily', 'weekly', 'monthly')
      and coalesce((recurrence ->> 'interval')::int, 1) between 1 and 12
    )
  ),
  add column planned_on date,
  add column estimate_minutes smallint check (estimate_minutes between 5 and 600),
  add column snoozed_until date;

create index tasks_user_planned on public.tasks (user_id, planned_on);

-- ---------------------------------------------------------------------------
-- Events: focus-block location and the "did you stay on it?" self-report
-- ---------------------------------------------------------------------------
alter table public.events
  add column place text check (place in ('library', 'home', 'group_room', 'other')),
  add column outcome text check (outcome in ('stayed', 'partly', 'drifted')),
  add column outcome_at timestamptz;

-- ---------------------------------------------------------------------------
-- Weekly timetable (entered once) and per-date exceptions ("cancelled this week")
-- ---------------------------------------------------------------------------
create table public.timetable_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'lecture' check (kind in ('lecture', 'lab', 'seminar', 'tutorial', 'training', 'match', 'other')),
  weekday smallint not null check (weekday between 1 and 7), -- ISO: Mon = 1
  start_time time not null,
  end_time time not null,
  location text check (char_length(location) <= 120),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_time > start_time),
  check (ends_on >= starts_on)
);

create table public.session_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  on_date date not null,
  created_at timestamptz not null default now(),
  unique (session_id, on_date),
  foreign key (session_id, user_id) references public.timetable_sessions (id, user_id) on delete cascade
);

create index timetable_user_weekday on public.timetable_sessions (user_id, weekday);
create index session_exceptions_user_date on public.session_exceptions (user_id, on_date);

-- ---------------------------------------------------------------------------
-- Milestones belong to exactly one goal or one project
-- ---------------------------------------------------------------------------
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  due_on date,
  done_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check ((goal_id is null) <> (project_id is null)),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

create index milestones_goal on public.milestones (goal_id);
create index milestones_project on public.milestones (project_id);

create table public.goal_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  progress smallint check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);

create index goal_updates_goal on public.goal_updates (goal_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Habits and their daily log
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid,
  title text not null check (char_length(title) between 1 and 120),
  -- build: something you do. check_in: an honest daily self-report (e.g. phone-down).
  kind text not null default 'build' check (kind in ('build', 'check_in')),
  -- daily | weekly (N times per week, any days) | days (specific weekdays)
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'days')),
  target_per_week smallint check (target_per_week between 1 and 7),
  weekdays smallint[] check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  part_of_day text not null default 'any' check (part_of_day in ('morning', 'evening', 'any')),
  -- The ~30-minute version that still counts on tired days.
  minimum_version text check (char_length(minimum_version) <= 200),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (frequency <> 'weekly' or target_per_week is not null),
  check (frequency <> 'days' or cardinality(weekdays) > 0),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  on_date date not null,
  -- done | minimum (the short version) | missed (an honest "no" for check-ins)
  status text not null default 'done' check (status in ('done', 'minimum', 'missed')),
  created_at timestamptz not null default now(),
  unique (habit_id, on_date),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

create index habit_logs_user_date on public.habit_logs (user_id, on_date);
create index habits_goal on public.habits (goal_id);

-- ---------------------------------------------------------------------------
-- Profile: gradual wake-time plan (morning person, 15 min a week)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column wake_current time,
  add column wake_target time,
  add column wake_step_minutes smallint not null default 15 check (wake_step_minutes between 5 and 30),
  add column wake_plan_started date;

-- ---------------------------------------------------------------------------
-- Triggers, RLS, grants
-- ---------------------------------------------------------------------------
create trigger timetable_sessions_updated_at before update on public.timetable_sessions
  for each row execute function public.set_updated_at();
create trigger habits_updated_at before update on public.habits
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['timetable_sessions', 'session_exceptions', 'milestones', 'goal_updates', 'habits', 'habit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: owner can read" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can update" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can delete" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;
