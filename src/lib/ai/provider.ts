import "server-only";
import type { TokenUsage } from "./pricing";

/**
 * Provider-neutral assistant interface. One adapter (Claude, src/lib/ai/anthropic.ts)
 * sits behind it; nothing else in the app talks to a model provider directly.
 * Server-only: API keys live in server environment variables and never reach the browser.
 */
export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiRequest = {
  /** Stable instructions first (cache-friendly), then the volatile data snapshot. */
  system: { rules: string; context: string };
  messages: AiMessage[];
  maxOutputTokens: number;
  effort: "low" | "medium" | "high";
  /** Constrain the reply to JSON matching this schema (structured output). */
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type AiResult = {
  text: string;
  /** "refusal" means the model (and its fallback) declined; text is then empty. */
  stopReason: "end" | "max_tokens" | "refusal" | "other";
  usage: TokenUsage;
  /** The model that actually answered (a server-side fallback can differ). */
  model: string;
};

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  generate(req: AiRequest): Promise<AiResult>;
  stream(req: AiRequest, onText: (delta: string) => void): Promise<AiResult>;
}

export type AiStatus =
  | { state: "off"; reason: "disabled_in_settings" }
  | { state: "off"; reason: "no_provider_configured" }
  | { state: "ready"; providerId: string; model: string };

/** Which provider the server is configured for (no secrets returned). */
export function configuredProvider(): { id: string; hasKey: boolean; model: string } | null {
  const id = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (!id) return null;
  const hasKey = id === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY?.trim()) : false;
  return { id, hasKey, model: process.env.AI_MODEL?.trim() || "claude-opus-5-5" };
}

/**
 * The single gate. "ready" only when the user switched it on in Settings
 * AND the server has a supported provider with a key.
 */
export function resolveAiStatus(enabledInSettings: boolean): AiStatus {
  if (!enabledInSettings) return { state: "off", reason: "disabled_in_settings" };
  const cfg = configuredProvider();
  if (!cfg || !cfg.hasKey || cfg.id !== "anthropic") return { state: "off", reason: "no_provider_configured" };
  return { state: "ready", providerId: cfg.id, model: cfg.model };
}

export function aiStatusMessage(status: AiStatus): string {
  if (status.state === "ready") return "Ready. It reads a snapshot of your LifeOS data each time you ask, and suggests; it never changes anything by itself.";
  switch (status.reason) {
    case "disabled_in_settings":
      return "The assistant is off. Switch it on in Settings (a provider key must also be set on the server).";
    case "no_provider_configured":
      return "Switched on, but no AI provider key is configured on the server, so the assistant stays off.";
  }
}

export async function getProvider(): Promise<AiProvider | null> {
  const cfg = configuredProvider();
  if (!cfg?.hasKey || cfg.id !== "anthropic") return null;
  const { createAnthropicProvider } = await import("./anthropic");
  return createAnthropicProvider(cfg.model);
}
