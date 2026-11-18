import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TZ } from "@/lib/time";
import type { Profile } from "@/lib/types";

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

const PROFILE_COLUMNS = "id,display_name,timezone,tone,trackers,ai_enabled";

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
