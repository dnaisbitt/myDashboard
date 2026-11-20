import { NextResponse } from "next/server";
import { z } from "zod";
import { describeAiError } from "@/lib/ai/anthropic";
import { recordUsage } from "@/lib/ai/budget";
import { buildAssistantContext } from "@/lib/ai/context";
import { guardAiRequest, sameOrigin } from "@/lib/ai/guard";
import { BREAKDOWN_SCHEMA, breakdownPrompt, contextBlock, RULES } from "@/lib/ai/prompts";

export const maxDuration = 60;

const bodySchema = z
  .object({ projectId: z.uuid().optional(), text: z.string().trim().min(3).max(1000).optional() })
  .refine((b) => b.projectId || b.text, { message: "Pick a project or describe the idea." });

const resultSchema = z.object({
  summary: z.string().max(400),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        minutes: z.number().int().min(5).max(600),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      }),
    )
    .max(12),
  questions: z.array(z.string().max(300)).max(3),
});

/**
 * Proposes concrete tasks for a project or a vague idea (structured output).
 * Nothing is created here: the browser shows the proposals and the user picks.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  let projectTitle: string | undefined;
  let projectDetail: string | undefined;
  if (parsed.data.projectId) {
    const { data: project } = await guard.supabase.from("projects").select("title,description").eq("id", parsed.data.projectId).maybeSingle();
    if (!project) return NextResponse.json({ error: "not_found", message: "That project wasn't found." }, { status: 404 });
    projectTitle = project.title as string;
    projectDetail = (project.description as string | null) ?? undefined;
  }

  try {
    const ctx = await buildAssistantContext();
    const res = await guard.provider.generate({
      system: { rules: RULES, context: contextBlock(ctx) },
      messages: [{ role: "user", content: breakdownPrompt({ text: parsed.data.text, projectTitle, projectDetail }) }],
      maxOutputTokens: 4000,
      effort: "medium",
      jsonSchema: BREAKDOWN_SCHEMA as unknown as Record<string, unknown>,
    });
    await recordUsage(guard.supabase, "breakdown", res.model, res.usage);
    if (res.stopReason === "refusal") return NextResponse.json({ error: "refused", message: "The assistant declined that one." }, { status: 502 });

    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      return NextResponse.json({ error: "bad_output", message: "The assistant's answer came back incomplete. Try again." }, { status: 502 });
    }
    const result = resultSchema.safeParse(json);
    if (!result.success) return NextResponse.json({ error: "bad_output", message: "The assistant's answer didn't have the expected shape. Try again." }, { status: 502 });
    return NextResponse.json({ ...result.data, projectId: parsed.data.projectId ?? null });
  } catch (e) {
    console.error("breakdown", e);
    const { status, message } = describeAiError(e);
    return NextResponse.json({ error: "provider", message }, { status });
  }
}
