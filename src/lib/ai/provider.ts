import "server-only";

/**
 * Provider-neutral assistant interface. Phase 6 adds one adapter (Claude) behind
 * this; nothing else in the app talks to a model provider directly.
 * Server-only: API keys live in server environment variables and never reach the browser.
 */
export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiRequest = {
  system: string;
  messages: AiMessage[];
  maxOutputTokens: number;
};

export type AiResponse = { text: string; inputTokens?: number; outputTokens?: number };

export interface AiProvider {
  readonly id: string;
  generate(req: AiRequest): Promise<AiResponse>;
}

export type AiStatus =
  | { state: "off"; reason: "disabled_in_settings" }
  | { state: "off"; reason: "no_provider_configured" }
  | { state: "off"; reason: "adapter_not_built" }
  | { state: "ready"; provider: AiProvider };

/** Which provider the server is configured for (no secrets returned). */
export function configuredProvider(): { id: string; hasKey: boolean } | null {
  const id = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (!id) return null;
  const hasKey = id === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : false;
  return { id, hasKey };
}

/**
 * The single gate. The assistant is only "ready" when the user switched it on
 * in Settings AND the server has a provider + key AND an adapter exists.
 */
export function resolveAiStatus(enabledInSettings: boolean): AiStatus {
  if (!enabledInSettings) return { state: "off", reason: "disabled_in_settings" };
  const cfg = configuredProvider();
  if (!cfg || !cfg.hasKey) return { state: "off", reason: "no_provider_configured" };
  // Phase 6: return { state: "ready", provider: createAnthropicProvider() } here.
  return { state: "off", reason: "adapter_not_built" };
}

export function aiStatusMessage(status: AiStatus): string {
  if (status.state === "ready") return "Assistant ready.";
  switch (status.reason) {
    case "disabled_in_settings":
      return "The assistant is off. It can be switched on in Settings once a provider key is added on the server.";
    case "no_provider_configured":
      return "Switched on, but no AI provider key is configured on the server, so the assistant stays off.";
    case "adapter_not_built":
      return "A provider key is present, but the assistant connection is built in Phase 6. Nothing is sent anywhere yet.";
  }
}
