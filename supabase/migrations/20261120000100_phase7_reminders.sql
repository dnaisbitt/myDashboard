-- Phase 7: Web Push reminders.
-- push_subscriptions: one row per browser/device that allowed notifications.
-- notification_log: every reminder sent (de-duplication + the "what do I act on" summary).
-- Rows in notification_log are written by the server's reminder job (service role);
-- the signed-in user can read them and mark one as opened, nothing else.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 10 and 1000),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  label text check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  -- Set only when you confirm a test notification actually arrived on this device.
  verified_at timestamptz,
  unique (endpoint)
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 40),
  -- What the reminder was about (habit id, task id, a date…) — used for de-duplication.
  ref_key text not null check (char_length(ref_key) between 1 and 120),
  local_date date not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 300),
  url text not null check (char_length(url) <= 300),
  sent_at timestamptz not null default now(),
  delivered smallint not null default 0,
  opened_at timestamptz,
  unique (user_id, type, ref_key, local_date)
);

create index notification_log_user_sent on public.notification_log (user_id, sent_at desc);

-- Per-type reminder settings: {"<type>": {"on": true, "at": "HH:MM"}}. Missing keys use app defaults.
alter table public.profiles
  add column reminders jsonb not null default '{}'::jsonb check (jsonb_typeof(reminders) = 'object');

alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

create policy "push_subscriptions: owner can read" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions: owner can insert" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: owner can update" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: owner can delete" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "notification_log: owner can read" on public.notification_log
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_log: owner can mark opened" on public.notification_log
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select on public.notification_log to authenticated;
grant update (opened_at) on public.notification_log to authenticated;

revoke all on public.push_subscriptions, public.notification_log from anon;
