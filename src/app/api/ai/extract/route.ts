import { NextResponse } from "next/server";
import { z } from "zod";
import { describeAiError } from "@/lib/ai/anthropic";
import { recordUsage } from "@/lib/ai/budget";
import { guardAiRequest, sameOrigin } from "@/lib/ai/guard";
import { EXTRACT_SCHEMA, extractPrompt, RULES } from "@/lib/ai/prompts";
import { getRange } from "@/lib/data/planner";
import { getClock } from "@/lib/data/viewer";
import { vetImports } from "@/lib/schedule";
import { addDaysToKey, formatTime, keyLabel, localToIso } from "@/lib/time";

export const maxDuration = 60;

const bodySchema = z.object({ text: z.string().trim().min(5, "There's no message to read.").max(6000, "That message is too long (6,000 characters max).") });

const resultSchema = z.object({
  summary: z.string().max(400),
  items: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start: z.string().max(5),
        end: z.string().max(5),
        title: z.string().trim().min(1).max(200),
        kind: z.enum(["training", "match", "event", "lecture", "gym", "social"]),
        location: z.string().trim().max(120).nullable(),
      }),
    )
    .max(30),
  unclear: z.array(z.string().max(300)).max(5),
});

/**
 * Reads events out of a shared message (e.g. WhatsApp training times).
 * Only the message, today's date and the next three weeks of your schedule are
 * sent, not your whole LifeOS snapshot. Nothing is saved here: results are checked
 * against your schedule and returned for you to tick.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  try {
    const { todayKey, tz, nowMs } = await getClock();
    const toKey = addDaysToKey(todayKey, 21);
    const range = await getRange(todayKey, toKey);
    const fixed = range.blocks
      .filter((b) => !b.cancelled)
      .map((b) => `- ${b.dateKey} ${formatTime(b.startsAt, tz)}–${formatTime(b.endsAt, tz)} ${b.title}`)
      .join("\n");

    const res = await guard.provider.generate({
      system: {
        rules: RULES,
        context: `Time zone ${tz}. Their schedule for the next three weeks, for reference only (don't list these unless the message mentions them):\n${fixed || "- nothing"}`,
      },
      messages: [{ role: "user", content: extractPrompt(parsed.data.text, todayKey, keyLabel(todayKey, { weekday: "long" })) }],
      maxOutputTokens: 4000,
      effort: "low",
      jsonSchema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
    });
    await recordUsage(guard.supabase, "chat", res.model, res.usage);
    if (res.stopReason === "refusal") return NextResponse.json({ error: "refused", message: "The assistant declined to read that message." }, { status: 502 });

    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      return NextResponse.json({ error: "bad_output", message: "The answer came back incomplete. Try again." }, { status: 502 });
    }
    const result = resultSchema.safeParse(json);
    if (!result.success) return NextResponse.json({ error: "bad_output", message: "The answer didn't have the expected shape. Try again." }, { status: 502 });

    const { items, dropped } = vetImports(result.data.items, range.blocks, {
      fromKey: todayKey,
      toKey,
      nowMs,
      toIso: (k, t) => localToIso(k, t, tz),
    });
    return NextResponse.json({ summary: result.data.summary, unclear: result.data.unclear, items, dropped });
  } catch (e) {
    console.error("extract", e);
    const { status, message } = describeAiError(e);
    return NextResponse.json({ error: "provider", message }, { status });
  }
}
