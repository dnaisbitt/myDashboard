-- Explicit table privileges for signed-in users.
--
-- Newer Supabase projects do not automatically grant the API roles access to
-- tables in `public` (secure-by-default). Without these grants every request
-- fails with "permission denied for table …" (42501) before RLS is even checked.
--
-- Privileges say which operations the role may attempt; the RLS policies in
-- 20261118000100_core.sql still decide which rows. Signed-out (anon) gets nothing.
-- Safe to run more than once.

grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.goals, public.projects, public.tasks, public.events to authenticated;

revoke all on public.profiles, public.goals, public.projects, public.tasks, public.events from anon;
