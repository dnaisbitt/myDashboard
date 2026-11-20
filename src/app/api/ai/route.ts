import { NextResponse } from "next/server";
import { getSpend } from "@/lib/ai/budget";
import { formatUsd } from "@/lib/ai/pricing";
import { aiStatusMessage, resolveAiStatus } from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Assistant status and this month's estimated spend. No model call. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ ready: false, message: "Database not configured." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("id", userId).maybeSingle();
  const status = resolveAiStatus(Boolean(profile?.ai_enabled));
  const spend = await getSpend(supabase).catch(() => null);
  return NextResponse.json({
    ready: status.state === "ready",
    message: aiStatusMessage(status),
    model: status.state === "ready" ? status.model : null,
    spend: spend
      ? { month: formatUsd(spend.monthMicroUsd), cap: formatUsd(spend.capMicroUsd), monthMicroUsd: spend.monthMicroUsd, capMicroUsd: spend.capMicroUsd }
      : null,
  });
}
