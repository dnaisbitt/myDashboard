-- Phase 5: money, body (gym, sleep, weight, lifts) and food.
-- Money is stored as integer pence (no floating point). Same rules as before:
-- owner-only RLS, composite (id, user_id) foreign keys, explicit grants.

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

-- A budget period, normally one university term, built around a loan instalment.
create table public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  -- Money already available at the start (current account + anything carried over).
  opening_pence integer not null default 0 check (opening_pence between -10000000 and 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (ends_on > starts_on)
);

-- Planned money in (instalments) and committed money out (rent, bills, subscriptions).
create table public.money_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'commitment')),
  title text not null check (char_length(title) between 1 and 80),
  amount_pence integer not null check (amount_pence between 1 and 100000000),
  cadence text not null default 'once' check (cadence in ('once', 'weekly', 'monthly')),
  first_on date not null,
  last_on date,
  category text check (char_length(category) <= 40),
  created_at timestamptz not null default now(),
  check (last_on is null or last_on >= first_on)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_on date not null,
  -- Positive = money out (spending), negative = money in (refund, transfer in).
  amount_pence integer not null check (amount_pence <> 0 and amount_pence between -100000000 and 100000000),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  note text check (char_length(note) <= 200),
  source text not null default 'manual' check (source in ('manual', 'csv')),
  -- CSV de-duplication: same date + amount + description is imported once.
  import_key text,
  created_at timestamptz not null default now(),
  unique (user_id, import_key)
);

create index transactions_user_date on public.transactions (user_id, occurred_on desc);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid,
  title text not null check (char_length(title) between 1 and 80),
  target_pence integer not null check (target_pence between 1 and 100000000),
  saved_pence integer not null default 0 check (saved_pence between 0 and 100000000),
  target_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);

-- ---------------------------------------------------------------------------
-- Body
-- ---------------------------------------------------------------------------

-- Pre-decided gym days are weekly timetable sessions of kind 'gym', so they show
-- on Today and in the Planner and can be "cancelled this week" like a lecture.
alter table public.timetable_sessions drop constraint timetable_sessions_kind_check;
alter table public.timetable_sessions add constraint timetable_sessions_kind_check
  check (kind in ('lecture', 'lab', 'seminar', 'tutorial', 'training', 'match', 'gym', 'other'));

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null,
  -- full session or the ~30-minute minimum version (still counts)
  kind text not null default 'full' check (kind in ('full', 'minimum')),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, on_date)
);

-- "Book your slot": which gym days you've booked (a reminder, not an integration).
create table public.gym_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, on_date)
);

create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The evening the night started (bed on the 18th, up on the 19th → night_of = 18th).
  night_of date not null,
  bed_at timestamptz,
  wake_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, night_of),
  check (bed_at is null or wake_at is null or wake_at > bed_at)
);

-- One row per day for the quick yes/no check-ins and optional trackers.
create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null,
  ate_well boolean,
  protein_hit boolean,
  calories integer check (calories between 0 and 20000),
  updated_at timestamptz not null default now(),
  unique (user_id, on_date)
);

create table public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null,
  kg numeric(5, 1) not null check (kg between 25 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, on_date)
);

create table public.lift_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null,
  lift text not null check (char_length(lift) between 1 and 40),
  kg numeric(5, 1) not null check (kg between 0 and 500),
  reps smallint not null check (reps between 1 and 50),
  created_at timestamptz not null default now()
);

create index lift_entries_user_lift on public.lift_entries (user_id, lift, on_date);

-- ---------------------------------------------------------------------------
-- Food
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'want_to_try' check (status in ('staple', 'want_to_try', 'cooked')),
  -- Cook-once-eat-twice: 2 portions = dinner tonight + lunch tomorrow.
  portions smallint not null default 2 check (portions between 1 and 12),
  minutes smallint check (minutes between 1 and 600),
  -- [{"name":"lean mince","qty":"500","unit":"g"}]
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  method text check (char_length(method) <= 10000),
  protein_g smallint check (protein_g between 0 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- One cooked dinner per evening. The next day's lunch (leftovers) is derived, not stored.
create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null,
  recipe_id uuid,
  -- Free text for nights without a recipe ("pasta + pesto", "out with the team").
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, on_date),
  check (recipe_id is not null or note is not null),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  qty text check (char_length(qty) <= 40),
  -- plan = generated from a week's meal plan (replaced on regenerate); manual = typed in
  source text not null default 'manual' check (source in ('plan', 'manual')),
  week_of date,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

create index shopping_items_user on public.shopping_items (user_id, checked, created_at);

-- ---------------------------------------------------------------------------
-- Profile: body targets and settings
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column bedtime_target time,
  add column gym_target_per_week smallint not null default 4 check (gym_target_per_week between 1 and 7),
  add column gym_quiet_times text check (char_length(gym_quiet_times) <= 300),
  add column currency text not null default 'GBP' check (currency = 'GBP');

-- ---------------------------------------------------------------------------
-- Triggers, RLS, grants
-- ---------------------------------------------------------------------------
create trigger budget_periods_updated_at before update on public.budget_periods
  for each row execute function public.set_updated_at();
create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();
create trigger sleep_logs_updated_at before update on public.sleep_logs
  for each row execute function public.set_updated_at();
create trigger daily_checkins_updated_at before update on public.daily_checkins
  for each row execute function public.set_updated_at();
create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array[
    'budget_periods', 'money_plan_items', 'transactions', 'savings_goals',
    'workouts', 'gym_bookings', 'sleep_logs', 'daily_checkins', 'weigh_ins', 'lift_entries',
    'recipes', 'meal_plan', 'shopping_items'
  ] loop
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
