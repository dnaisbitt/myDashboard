-- LifeOS core schema (Phase 3).
-- Every table is owned by one auth user and protected by Row Level Security.
-- Cross-table links use composite foreign keys (id, user_id) so a row can only
-- ever point at rows owned by the same user, even if an id is guessed.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and settings (one row per user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  timezone text not null default 'Europe/London',
  -- Per-area tone dial: gentle | direct | quiet
  tone jsonb not null default jsonb_build_object(
    'habits', 'gentle',
    'wake', 'gentle',
    'deadlines', 'direct',
    'exams', 'direct',
    'optional', 'quiet'
  ),
  -- Optional trackers, all off by default
  trackers jsonb not null default jsonb_build_object(
    'calories', false,
    'protein', false,
    'lifts', false
  ),
  -- The assistant is off until both this is on AND a provider key exists on the server.
  ai_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Goals → Projects → Tasks
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  horizon text not null default 'medium' check (horizon in ('short', 'medium', 'long')),
  area text not null default 'personal' check (area in ('personal', 'professional', 'financial', 'fitness')),
  target text,
  deadline date,
  status text not null default 'active' check (status in ('active', 'paused', 'achieved', 'dropped')),
  progress smallint not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  notes text,
  deadline date,
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'active' check (status in ('exploring', 'active', 'paused', 'done', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid,
  parent_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  notes text,
  -- inbox: captured, not yet decided. open: committed. done. archived: decided against.
  status text not null default 'open' check (status in ('inbox', 'open', 'done', 'archived')),
  -- 1 = high, 2 = normal, 3 = low
  priority smallint not null default 2 check (priority between 1 and 3),
  due_at timestamptz,
  due_has_time boolean not null default false,
  -- "Top three" for a given local date. rank 1..3, unique per user and date.
  today_date date,
  today_rank smallint check (today_rank between 1 and 3),
  completed_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'capture', 'import', 'recurring')),
  raw_input text,
  last_surfaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check ((today_rank is null) = (today_date is null)),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (parent_id, user_id) references public.tasks (id, user_id) on delete cascade
);

create unique index tasks_today_rank_unique on public.tasks (user_id, today_date, today_rank)
  where today_rank is not null;
create index tasks_user_status_due on public.tasks (user_id, status, due_at);
create index tasks_user_today on public.tasks (user_id, today_date);
create index tasks_project on public.tasks (project_id);
create index tasks_parent on public.tasks (parent_id);
create index projects_goal on public.projects (goal_id);

-- ---------------------------------------------------------------------------
-- Calendar blocks: one-off events, focus blocks, appointments.
-- (The recurring lecture timetable arrives in Phase 4 as its own table.)
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'event' check (kind in ('event', 'focus', 'lecture', 'training', 'match', 'gym', 'routine', 'social')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text check (char_length(location) <= 120),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (ends_at > starts_at),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);

create index events_user_start on public.events (user_id, starts_at);

create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only on every table.
-- (select auth.uid()) is evaluated once per statement, not per row.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.events enable row level security;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: owner can update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: owner can insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

do $$
declare
  t text;
begin
  foreach t in array array['goals', 'projects', 'tasks', 'events'] loop
    execute format(
      'create policy "%1$s: owner can read" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can update" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can delete" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- No access at all for anonymous (signed-out) requests.
revoke all on public.profiles, public.goals, public.projects, public.tasks, public.events from anon;
