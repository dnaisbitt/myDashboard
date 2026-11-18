import { NextResponse } from "next/server";
import { aiStatusMessage, resolveAiStatus } from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Assistant endpoint (skeleton). Requires a signed-in user, then checks the
 * single on/off gate. Until Phase 6 it always answers 503 "not configured",
 * and never returns generated or placeholder text.
 */
export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "not_configured", message: "Database not configured." }, { status: 503 });
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("id", userId).maybeSingle();
  const status = resolveAiStatus(Boolean(profile?.ai_enabled));
  if (status.state !== "ready") {
    return NextResponse.json({ error: "not_configured", reason: status.reason, message: aiStatusMessage(status) }, { status: 503 });
  }

  // Phase 6: validate body, build context, call status.provider.generate(), return text.
  return NextResponse.json({ error: "not_configured", reason: "adapter_not_built" }, { status: 503 });
}
