-- Phase 6: AI assistant bookkeeping.
-- ai_usage is the ledger the server checks before every call, so the monthly
-- spend cap is enforced by the app, independent of the Claude Console limit.
-- ai_briefings caches one briefing per day so Today never pays twice for it.
-- Conversation text is NOT stored.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chat', 'briefing', 'breakdown')),
  model text not null check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  -- Estimated cost in millionths of a US dollar (API billing currency).
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_user_created on public.ai_usage (user_id, created_at desc);

create table public.ai_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null,
  content text not null check (char_length(content) <= 8000),
  model text not null check (char_length(model) <= 80),
  created_at timestamptz not null default now(),
  unique (user_id, on_date)
);

alter table public.ai_usage enable row level security;
alter table public.ai_briefings enable row level security;

-- Usage rows are append-only from the app: read + insert, no update/delete.
create policy "ai_usage: owner can read" on public.ai_usage
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_usage: owner can insert" on public.ai_usage
  for insert to authenticated with check ((select auth.uid()) = user_id);
grant select, insert on public.ai_usage to authenticated;

create policy "ai_briefings: owner can read" on public.ai_briefings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_briefings: owner can insert" on public.ai_briefings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_briefings: owner can update" on public.ai_briefings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ai_briefings: owner can delete" on public.ai_briefings
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.ai_briefings to authenticated;

revoke all on public.ai_usage, public.ai_briefings from anon;
