import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateMicroUsd, type TokenUsage } from "./pricing";

/**
 * The app's own spend guard, checked before every call. Defaults: $6 a month
 * (about £5) and 60 requests a day. Configure with AI_MONTHLY_BUDGET_USD and
 * AI_DAILY_REQUEST_LIMIT. The Claude Console spend limit remains the hard backstop.
 */
export function limits() {
  const monthlyUsd = Number(process.env.AI_MONTHLY_BUDGET_USD ?? 6);
  const daily = Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 60);
  return {
    monthlyMicroUsd: Math.round((Number.isFinite(monthlyUsd) && monthlyUsd > 0 ? monthlyUsd : 6) * 1_000_000),
    dailyRequests: Number.isFinite(daily) && daily > 0 ? daily : 60,
  };
}

export type Spend = { monthMicroUsd: number; capMicroUsd: number; todayRequests: number; dailyLimit: number };

export async function getSpend(supabase: SupabaseClient): Promise<Spend> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data, error } = await supabase.from("ai_usage").select("cost_micro_usd,created_at").gte("created_at", monthStart).limit(5000);
  if (error) throw new Error(`Could not read AI usage: ${error.message}`);
  const l = limits();
  return {
    monthMicroUsd: (data ?? []).reduce((s, r) => s + Number(r.cost_micro_usd), 0),
    capMicroUsd: l.monthlyMicroUsd,
    todayRequests: (data ?? []).filter((r) => (r.created_at as string) >= dayStart).length,
    dailyLimit: l.dailyRequests,
  };
}

export function overLimit(s: Spend): string | null {
  if (s.monthMicroUsd >= s.capMicroUsd)
    return `This month's AI budget ($${(s.capMicroUsd / 1e6).toFixed(2)}) is used up. It resets on the 1st, or raise AI_MONTHLY_BUDGET_USD.`;
  if (s.todayRequests >= s.dailyLimit) return `That's ${s.dailyLimit} assistant requests in 24 hours, the daily limit. Try again later.`;
  return null;
}

export async function recordUsage(supabase: SupabaseClient, kind: "chat" | "briefing" | "breakdown", model: string, u: TokenUsage) {
  const { error } = await supabase.from("ai_usage").insert({
    kind,
    model,
    input_tokens: u.input,
    output_tokens: u.output,
    cache_read_tokens: u.cacheRead,
    cache_write_tokens: u.cacheWrite,
    cost_micro_usd: estimateMicroUsd(model, u),
  });
  if (error) console.error("recordUsage", error.message);
}
