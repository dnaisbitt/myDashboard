import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSpend, overLimit } from "./budget";
import { aiStatusMessage, getProvider, resolveAiStatus, type AiProvider } from "./provider";

type Guarded =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; provider: AiProvider }
  | { ok: false; response: NextResponse };

const fail = (status: number, error: string, message: string) => ({ ok: false as const, response: NextResponse.json({ error, message }, { status }) });

/**
 * Every assistant request passes through here: signed in → switched on in
 * Settings → provider key on the server → under the monthly and daily limits.
 */
export async function guardAiRequest(): Promise<Guarded> {
  if (!isSupabaseConfigured()) return fail(503, "not_configured", "Database not configured.");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return fail(401, "unauthorised", "You're signed out. Sign in again.");

  const { data: profile } = await supabase.from("profiles").select("ai_enabled").eq("id", userId).maybeSingle();
  const status = resolveAiStatus(Boolean(profile?.ai_enabled));
  if (status.state !== "ready") return fail(503, "not_configured", aiStatusMessage(status));

  const limitMessage = overLimit(await getSpend(supabase));
  if (limitMessage) return fail(429, "over_budget", limitMessage);

  const provider = await getProvider();
  if (!provider) return fail(503, "not_configured", "No AI provider is configured on the server.");
  return { ok: true, supabase, provider };
}

/** Basic same-origin check for state-changing requests from the browser. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from some browsers omit it
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
