-- LifeOS reminders: run the reminder job every 15 minutes.
-- Run this ONCE in the Supabase SQL editor, AFTER:
--   1. Database → Extensions: enable "pg_cron" and "pg_net".
--   2. Deploying LifeOS with CRON_SECRET, SUPABASE_SECRET_KEY and the VAPID keys set in Vercel.
-- Replace the two placeholders below. The values are stored encrypted in Supabase Vault,
-- not in this file and not in the job definition.
-- (Not a migration: it needs pg_cron/pg_net and your secrets, so it isn't run by the test harness.)

select vault.create_secret('https://YOUR-APP.vercel.app/api/cron/reminders', 'lifeos_reminders_url');
select vault.create_secret('PASTE-THE-SAME-CRON_SECRET-AS-VERCEL', 'lifeos_cron_secret');

select cron.schedule(
  'lifeos-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'lifeos_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lifeos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it's running (after 15 minutes):
--   select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
-- Expect status_code 200 and content like {"users":1,"due":0,"sent":0,...}.
--
-- To change the URL or secret later:
--   update vault.secrets set secret = '...' where name = 'lifeos_cron_secret';
-- To stop reminders entirely:
--   select cron.unschedule('lifeos-reminders');
