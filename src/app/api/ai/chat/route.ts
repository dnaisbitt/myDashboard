import { NextResponse } from "next/server";
import { z } from "zod";
import { describeAiError } from "@/lib/ai/anthropic";
import { recordUsage } from "@/lib/ai/budget";
import { buildAssistantContext } from "@/lib/ai/context";
import { guardAiRequest, sameOrigin } from "@/lib/ai/guard";
import { contextBlock, QUICK_ACTIONS, RULES } from "@/lib/ai/prompts";
import { STREAM_ERROR } from "@/lib/ai/stream-protocol";

export const maxDuration = 60;

const bodySchema = z.object({
  action: z.enum(Object.keys(QUICK_ACTIONS) as [keyof typeof QUICK_ACTIONS, ...Array<keyof typeof QUICK_ACTIONS>]).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .max(24)
    .default([]),
});

/**
 * Streams a plain-text reply. The conversation lives in the browser only;
 * nothing but token counts and estimated cost is stored.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", message: "That message couldn't be read." }, { status: 400 });

  let messages = parsed.data.messages;
  if (parsed.data.action) messages = [...messages, { role: "user" as const, content: QUICK_ACTIONS[parsed.data.action].prompt }];
  if (!messages.length || messages[0].role !== "user" || messages.at(-1)!.role !== "user")
    return NextResponse.json({ error: "bad_request", message: "Ask something first." }, { status: 400 });
  if (messages.reduce((n, m) => n + m.content.length, 0) > 40_000)
    return NextResponse.json({ error: "too_long", message: "This conversation is getting long. Start a new one." }, { status: 413 });

  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  let context: string;
  try {
    context = contextBlock(await buildAssistantContext());
  } catch (e) {
    console.error("assistant context", e);
    return NextResponse.json({ error: "context", message: "Couldn't read your LifeOS data to answer that." }, { status: 500 });
  }

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  const effort = parsed.data.action === "plan_week" || parsed.data.action === "review" ? "medium" : "low";

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await guard.provider.stream(
          { system: { rules: RULES, context }, messages, maxOutputTokens: 6000, effort, signal: abort.signal },
          (delta) => controller.enqueue(encoder.encode(delta)),
        );
        await recordUsage(guard.supabase, "chat", res.model, res.usage);
        if (res.stopReason === "refusal")
          controller.enqueue(encoder.encode(`${STREAM_ERROR}The assistant declined to answer that. Try rephrasing.`));
        else if (res.stopReason === "max_tokens") controller.enqueue(encoder.encode("\n\n(Stopped at the length limit.)"));
      } catch (e) {
        const { message } = describeAiError(e);
        if (!abort.signal.aborted) console.error("assistant chat", e);
        controller.enqueue(encoder.encode(`${STREAM_ERROR}${message}`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
