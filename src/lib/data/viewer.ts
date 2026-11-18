import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { dateKey, DEFAULT_TZ } from "@/lib/time";
import { PROFILE_COLUMNS, type Profile } from "@/lib/types";

/**
 * Data Access Layer entry point. Verifies the session (JWT signature checked by
 * getClaims) and returns a client that acts as that user. Deduplicated per request.
 */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? null };
});

/** For Server Actions: same check, but returns null instead of redirecting. */
export async function getActionViewer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  return { supabase, userId };
}



export const getProfile = cache(async (): Promise<Profile> => {
  const { supabase, userId } = await getViewer();
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  if (data) return data as Profile;

  // The signup trigger should have created it; repair if it did not.
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select(PROFILE_COLUMNS)
    .single();
  if (insertError) throw new Error(`Could not create your profile: ${insertError.message}`);
  return created as Profile;
});

export async function getTimezone() {
  const p = await getProfile();
  return p.timezone || DEFAULT_TZ;
}

/** The request's "now" in the user's zone. Read once per request in the data layer. */
export async function getClock() {
  const profile = await getProfile();
  const nowMs = Date.now();
  return { nowMs, tz: profile.timezone, todayKey: dateKey(nowMs, profile.timezone), profile };
}
