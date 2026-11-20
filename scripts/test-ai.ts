// Tests the Claude adapter's request shape and response handling against a fake
// transport (no network, no cost), plus the cost estimate and budget guard.
// Run: npm run test:ai
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnthropicProvider, describeAiError } from "../src/lib/ai/anthropic";
import { overLimit } from "../src/lib/ai/budget";
import { estimateMicroUsd } from "../src/lib/ai/pricing";
import { BREAKDOWN_SCHEMA } from "../src/lib/ai/prompts";

// Run with --conditions=react-server so "server-only" resolves to its no-op build,
// exactly as it does inside Next's server bundle.

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

function fakeFetch(reply: Record<string, unknown>, status = 200, captured: Captured[] = []) {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });
  }) as typeof fetch;
}

const message = (over: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: "Do the coursework first." }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 5000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 4000 },
  ...over,
});

const req = {
  system: { rules: "RULES", context: "CONTEXT" },
  messages: [{ role: "user" as const, content: "What should I focus on?" }],
  maxOutputTokens: 2000,
  effort: "low" as const,
};

test("request: model, fallbacks, effort, system blocks, caching, beta header", async () => {
  const captured: Captured[] = [];
  const p = createAnthropicProvider("claude-opus-5-5", { apiKey: "sk-test", fetch: fakeFetch(message(), 200, captured) });
  const res = await p.generate(req);
  const { body, headers, url } = captured[0];
  assert.match(url, /\/v1\/messages/);
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  assert.deepEqual(body.output_config, { effort: "low" });
  assert.deepEqual(body.cache_control, { type: "ephemeral" });
  assert.deepEqual(body.system, [{ type: "text", text: "RULES" }, { type: "text", text: "CONTEXT" }]);
  assert.equal(body.max_tokens, 2000);
  assert.equal("thinking" in body, false, "thinking left at its default (adaptive)");
  assert.equal("temperature" in body, false);
  assert.match(headers.get("anthropic-beta") ?? "", /server-side-fallback-2026-07-01/);
  assert.equal(headers.get("authorization"), "Bearer sk-test", "the server-side key is what authenticates");
  assert.equal(res.text, "Do the coursework first.");
  assert.equal(res.stopReason, "end");
  assert.deepEqual(res.usage, { input: 5000, output: 300, cacheRead: 0, cacheWrite: 4000 });
});

test("structured output adds the JSON schema to output_config", async () => {
  const captured: Captured[] = [];
  const p = createAnthropicProvider("claude-opus-5-5", { apiKey: "k", fetch: fakeFetch(message(), 200, captured) });
  await p.generate({ ...req, effort: "medium", jsonSchema: BREAKDOWN_SCHEMA as unknown as Record<string, unknown> });
  const oc = captured[0].body.output_config as { effort: string; format: { type: string; schema: { required: string[] } } };
  assert.equal(oc.effort, "medium");
  assert.equal(oc.format.type, "json_schema");
  assert.deepEqual(oc.format.schema.required, ["summary", "tasks", "questions"]);
});

test("refusal: no text is shown and the stop reason is reported", async () => {
  const p = createAnthropicProvider("claude-opus-5-5", {
    apiKey: "k",
    fetch: fakeFetch(message({ stop_reason: "refusal", content: [{ type: "text", text: "partial" }], stop_details: { type: "refusal", category: null, explanation: null } })),
  });
  const res = await p.generate(req);
  assert.equal(res.stopReason, "refusal");
  assert.equal(res.text, "");
});

test("errors map to plain messages (bad key, rate limit)", async () => {
  const err = { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } };
  const bad = createAnthropicProvider("claude-opus-5-5", { apiKey: "k", fetch: fakeFetch(err, 401) });
  await assert.rejects(bad.generate(req), (e) => {
    assert.match(describeAiError(e).message, /rejected the server's API key/);
    return true;
  });
  const limited = createAnthropicProvider("claude-opus-5-5", {
    apiKey: "k",
    fetch: fakeFetch({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, 429),
  });
  await assert.rejects(limited.generate(req), (e) => {
    assert.equal(describeAiError(e).status, 429);
    return true;
  });
});

test("cost estimate: Opus 5.5 rates, cache writes 1.25x, unknown models priced high", () => {
  // 5000 in × $4 + 300 out × $20 + 4000 cache-write × $5 = 0.02 + 0.006 + 0.02 = $0.046
  assert.equal(estimateMicroUsd("claude-opus-5-5", { input: 5000, output: 300, cacheRead: 0, cacheWrite: 4000 }), 46000);
  assert.equal(estimateMicroUsd("claude-sonnet-5-5", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }), 2_000_000);
  assert.equal(estimateMicroUsd("some-future-model", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }), 4_000_000);
});

test("budget guard blocks at the monthly cap and the daily limit", () => {
  const base = { monthMicroUsd: 0, capMicroUsd: 6_000_000, todayRequests: 0, dailyLimit: 60 };
  assert.equal(overLimit(base), null);
  assert.match(overLimit({ ...base, monthMicroUsd: 6_000_000 })!, /budget/);
  assert.match(overLimit({ ...base, todayRequests: 60 })!, /daily limit/);
});
