import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiRequest, AiResult } from "./provider";

/**
 * Claude adapter. Notes on the request shape:
 * - Thinking is left at its default (adaptive; it can't be switched off on Claude Opus 5.5);
 *   depth and spend are controlled with output_config.effort.
 * - Server-side refusal fallbacks are on ("default" routing by refusal category). A
 *   declined request is re-run on Anthropic's recommended fallback model in the same call.
 * - Top-level cache_control caches the stable prefix (rules + snapshot + history), so a
 *   follow-up question within ~5 minutes re-reads it at the cache price.
 */
export function createAnthropicProvider(model: string, opts: { fetch?: typeof fetch; apiKey?: string } = {}): AiProvider {
  const client = new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    maxRetries: opts.fetch ? 0 : 2,
    timeout: 90_000,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });

  const params = (req: AiRequest) => ({
    model,
    max_tokens: req.maxOutputTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    cache_control: { type: "ephemeral" as const },
    system: [
      { type: "text" as const, text: req.system.rules },
      { type: "text" as const, text: req.system.context },
    ],
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    output_config: {
      effort: req.effort,
      ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}),
    },
  });

  const toResult = (msg: Anthropic.Beta.BetaMessage): AiResult => {
    const refused = msg.stop_reason === "refusal";
    const text = refused
      ? ""
      : msg.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
    return {
      text,
      stopReason: refused ? "refusal" : msg.stop_reason === "max_tokens" ? "max_tokens" : msg.stop_reason === "end_turn" ? "end" : "other",
      usage: {
        input: msg.usage.input_tokens ?? 0,
        output: msg.usage.output_tokens ?? 0,
        cacheRead: msg.usage.cache_read_input_tokens ?? 0,
        cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
      },
      model: msg.model,
    };
  };

  return {
    id: "anthropic",
    model,
    async generate(req) {
      const msg = await client.beta.messages.create(params(req), { signal: req.signal });
      return toResult(msg);
    },
    async stream(req, onText) {
      const stream = client.beta.messages.stream(params(req), { signal: req.signal });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
      }
      return toResult(await stream.finalMessage());
    },
  };
}

/** Map SDK errors to a plain sentence for the UI; the detail goes to server logs. */
export function describeAiError(error: unknown): { status: number; message: string } {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return { status: 502, message: "The AI provider rejected the server's API key. Check ANTHROPIC_API_KEY in Vercel." };
  if (error instanceof Anthropic.RateLimitError) return { status: 429, message: "The AI provider is rate-limiting requests. Try again in a minute." };
  if (error instanceof Anthropic.BadRequestError) return { status: 502, message: "The AI provider couldn't process that request." };
  if (error instanceof Anthropic.APIConnectionError) return { status: 504, message: "Couldn't reach the AI provider. Check your connection and try again." };
  if (error instanceof Anthropic.APIError) return { status: 502, message: `The AI provider returned an error (${error.status ?? "unknown"}). Try again.` };
  if (error instanceof Error && error.name === "AbortError") return { status: 499, message: "Stopped." };
  return { status: 500, message: "Something went wrong talking to the assistant." };
}
