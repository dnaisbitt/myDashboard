import { NextResponse } from "next/server";
import { describeAiError } from "@/lib/ai/anthropic";
import { recordUsage } from "@/lib/ai/budget";
import { buildAssistantContext } from "@/lib/ai/context";
import { guardAiRequest, sameOrigin } from "@/lib/ai/guard";
import { BRIEFING_PROMPT, contextBlock, RULES } from "@/lib/ai/prompts";

export const maxDuration = 60;

/**
 * Today's briefing. Generated only when asked (button on Today), then cached for
 * the day, so opening the app never spends money by itself. POST regenerates.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  try {
    const ctx = await buildAssistantContext();
    const res = await guard.provider.generate({
      system: { rules: RULES, context: contextBlock(ctx) },
      messages: [{ role: "user", content: BRIEFING_PROMPT }],
      maxOutputTokens: 2000,
      effort: "low",
    });
    await recordUsage(guard.supabase, "briefing", res.model, res.usage);
    if (res.stopReason === "refusal" || !res.text.trim())
      return NextResponse.json({ error: "refused", message: "The assistant couldn't write a briefing this time. Try again later." }, { status: 502 });

    const content = res.text.trim().slice(0, 8000);
    const { error } = await guard.supabase
      .from("ai_briefings")
      .upsert({ on_date: ctx.today, content, model: res.model }, { onConflict: "user_id,on_date" });
    if (error) console.error("briefing save", error.message);
    return NextResponse.json({ content, model: res.model, onDate: ctx.today });
  } catch (e) {
    console.error("briefing", e);
    const { status, message } = describeAiError(e);
    return NextResponse.json({ error: "provider", message }, { status });
  }
}
