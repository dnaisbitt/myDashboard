import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client: BYPASSES row-level security.
 * Used only by the reminder job (/api/cron/reminders), which has no user session.
 * Every query made with it must filter by user_id explicitly.
 * The key lives only in server env (SUPABASE_SECRET_KEY); never NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
