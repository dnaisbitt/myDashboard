/**
 * Published per-token prices (USD per million tokens) used to *estimate* spend
 * for the app's own budget guard. The Claude Console bill is the source of truth;
 * keep its monthly spend limit set as the hard backstop.
 * Cache writes are 1.25× input (5-minute TTL); cache reads are listed separately.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export type TokenUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** Unknown models are priced as Opus 5.5 so the estimate errs high, never low. */
export function estimateMicroUsd(model: string, u: TokenUsage) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const usd = (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.input * 1.25) / 1_000_000;
  return Math.ceil(usd * 1_000_000);
}

export function formatUsd(microUsd: number) {
  const v = microUsd / 1_000_000;
  return v < 0.01 && v > 0 ? "<$0.01" : `$${v.toFixed(2)}`;
}
