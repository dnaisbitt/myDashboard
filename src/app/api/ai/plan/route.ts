import { NextResponse } from "next/server";
import { z } from "zod";
import { describeAiError } from "@/lib/ai/anthropic";
import { recordUsage } from "@/lib/ai/budget";
import { buildAssistantContext } from "@/lib/ai/context";
import { guardAiRequest, sameOrigin } from "@/lib/ai/guard";
import { contextBlock, PLAN_SCHEMA, planPrompt, RULES } from "@/lib/ai/prompts";
import { getRange } from "@/lib/data/planner";
import { vetProposals } from "@/lib/schedule";
import { addDaysToKey, formatTime, localToIso } from "@/lib/time";

export const maxDuration = 60;

const bodySchema = z.object({ scope: z.enum(["day", "week"]) });

const resultSchema = z.object({
  summary: z.string().max(600),
  blocks: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start: z.string(),
        end: z.string(),
        title: z.string().trim().min(1).max(200),
        kind: z.enum(["focus", "gym", "routine", "event"]),
        place: z.enum(["library", "home", "group_room", "other"]).nullable(),
        why: z.string().max(200),
      }),
    )
    .max(20),
  warnings: z.array(z.string().max(300)).max(5),
});

/**
 * Proposes schedule blocks. Nothing is saved here: proposals are checked against
 * the real schedule (clashes, past times, range) and returned for the user to tick.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", message: "Choose day or week." }, { status: 400 });

  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  try {
    const ctx = await buildAssistantContext();
    const tz = ctx.timezone;
    const fromKey = ctx.today;
    const toKey = parsed.data.scope === "day" ? fromKey : addDaysToKey(fromKey, 6);
    const range = await getRange(fromKey, toKey);
    const fixed = range.blocks.length
      ? range.blocks
          .map((b) => `- ${b.dateKey} ${formatTime(b.startsAt, tz)}–${formatTime(b.endsAt, tz)} ${b.title} (${b.kind}${b.cancelled ? ", CANCELLED" : ""})`)
          .join("\n")
      : "- nothing";

    const res = await guard.provider.generate({
      system: { rules: RULES, context: contextBlock(ctx) },
      messages: [{ role: "user", content: planPrompt(parsed.data.scope, fromKey, toKey, fixed) }],
      maxOutputTokens: 6000,
      effort: parsed.data.scope === "week" ? "medium" : "low",
      jsonSchema: PLAN_SCHEMA as unknown as Record<string, unknown>,
    });
    // Planning requests are logged under "chat" (they're started from the assistant panel).
    await recordUsage(guard.supabase, "chat", res.model, res.usage);
    if (res.stopReason === "refusal") return NextResponse.json({ error: "refused", message: "The assistant declined that one." }, { status: 502 });

    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      return NextResponse.json({ error: "bad_output", message: "The plan came back incomplete. Try again." }, { status: 502 });
    }
    const result = resultSchema.safeParse(json);
    if (!result.success) return NextResponse.json({ error: "bad_output", message: "The plan didn't have the expected shape. Try again." }, { status: 502 });

    const { keep, dropped } = vetProposals(result.data.blocks, range.blocks, {
      fromKey,
      toKey,
      nowMs: Date.now(),
      toIso: (k, t) => localToIso(k, t, tz),
    });
    return NextResponse.json({ summary: result.data.summary, warnings: result.data.warnings, blocks: keep, dropped });
  } catch (e) {
    console.error("plan", e);
    const { status, message } = describeAiError(e);
    return NextResponse.json({ error: "provider", message }, { status });
  }
}
