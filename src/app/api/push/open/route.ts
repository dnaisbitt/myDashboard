import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Tapping a reminder lands here: record that it was opened (for the
 * "what do you act on" summary), then go to the page it's about.
 * Only same-site paths are followed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "/";
  const safeTo = to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") ? to : "/";
  const id = url.searchParams.get("id");

  if (isSupabaseConfigured() && id && z.uuid().safeParse(id).success) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) {
      await supabase.from("notification_log").update({ opened_at: new Date().toISOString() }).eq("id", id).is("opened_at", null);
    }
  }
  return NextResponse.redirect(new URL(safeTo, url.origin));
}
