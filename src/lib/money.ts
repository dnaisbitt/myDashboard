import { addDaysToKey, addMonthsToKey, daysBetweenKeys, weekStartKey } from "./time";

/** All money is integer pence. Positive transaction = money out. */
export type BudgetPeriod = { id: string; title: string; starts_on: string; ends_on: string; opening_pence: number };
export type PlanItem = {
  id: string;
  kind: "income" | "commitment";
  title: string;
  amount_pence: number;
  cadence: "once" | "weekly" | "monthly";
  first_on: string;
  last_on: string | null;
  category: string | null;
};
export type Txn = { id: string; occurred_on: string; amount_pence: number; category: string; note: string | null; source: "manual" | "csv" };

export const CATEGORIES = ["Groceries", "Eating out", "Takeaway", "Transport", "Going out", "Sport", "Uni", "Subscriptions", "Clothes", "Gifts", "Other"];

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbpWhole = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** £4.50, or £1,204 with `whole` (rounded to the pound). */
export function formatGBP(pence: number, opts: { whole?: boolean } = {}) {
  return opts.whole ? gbpWhole.format(Math.round(pence / 100)) : gbp.format(pence / 100);
}

/** "4.5" | "£4.50" | "1,204" | "-3" → pence; null if not a number. */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[£,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Occurrence dates of a planned item within [fromKey, toKey]. */
export function occurrences(item: Pick<PlanItem, "cadence" | "first_on" | "last_on">, fromKey: string, toKey: string): string[] {
  const end = item.last_on && item.last_on < toKey ? item.last_on : toKey;
  if (item.cadence === "once") return item.first_on >= fromKey && item.first_on <= end ? [item.first_on] : [];
  const out: string[] = [];
  for (let i = 0, k = item.first_on; k <= end && i < 400; ) {
    if (k >= fromKey) out.push(k);
    i++;
    k = item.cadence === "weekly" ? addDaysToKey(item.first_on, 7 * i) : addMonthsToKey(item.first_on, i);
  }
  return out;
}

export type Budget = {
  income: number;
  commitments: number;
  spentInPeriod: number;
  spentThisWeek: number;
  weeksRemaining: number;
  allowancePerWeek: number;
  leftThisWeek: number;
  leftInPeriod: number;
  nextIncome: { title: string; on: string; pence: number } | null;
  nextCommitment: { title: string; on: string; pence: number } | null;
  /** Lowest projected balance (if below zero) when spending the allowance evenly. */
  lowPoint: { on: string; pence: number } | null;
  weekStart: string;
};

/**
 * "You have £X left this week":
 *   pool      = opening + planned income in the term − commitments in the term − spending before this week
 *   allowance = pool ÷ weeks remaining (including this one)
 *   left      = allowance − spent this week
 * Income counts for the whole term even before it arrives, so `lowPoint`
 * checks the running balance and warns if you'd dip below zero waiting for it.
 */
export function computeBudget(period: BudgetPeriod, items: PlanItem[], txns: Txn[], todayKey: string): Budget {
  const today = todayKey < period.starts_on ? period.starts_on : todayKey > period.ends_on ? period.ends_on : todayKey;
  const weekStart = weekStartKey(today) < period.starts_on ? period.starts_on : weekStartKey(today);
  const weekEnd = addDaysToKey(weekStartKey(today), 6);

  const dated: Array<{ on: string; pence: number; title: string; kind: PlanItem["kind"] }> = [];
  for (const it of items)
    for (const on of occurrences(it, period.starts_on, period.ends_on)) dated.push({ on, pence: it.amount_pence, title: it.title, kind: it.kind });
  dated.sort((a, b) => a.on.localeCompare(b.on));

  const income = dated.filter((d) => d.kind === "income").reduce((s, d) => s + d.pence, 0);
  const commitments = dated.filter((d) => d.kind === "commitment").reduce((s, d) => s + d.pence, 0);
  const inPeriod = txns.filter((t) => t.occurred_on >= period.starts_on && t.occurred_on <= period.ends_on);
  const spentBefore = inPeriod.filter((t) => t.occurred_on < weekStart).reduce((s, t) => s + t.amount_pence, 0);
  const spentThisWeek = inPeriod.filter((t) => t.occurred_on >= weekStart).reduce((s, t) => s + t.amount_pence, 0);

  const weeksRemaining = Math.max(1, Math.ceil((daysBetweenKeys(weekStart, period.ends_on) + 1) / 7));
  const pool = period.opening_pence + income - commitments - spentBefore;
  const allowancePerWeek = Math.floor(pool / weeksRemaining);

  // Running balance: actual so far, then planned items plus the allowance spread over the days left.
  let balance = period.opening_pence - spentBefore - spentThisWeek;
  for (const d of dated) if (d.on <= today) balance += d.kind === "income" ? d.pence : -d.pence;
  let low: { on: string; pence: number } | null = balance < 0 ? { on: today, pence: balance } : null;
  const daysLeftThisWeek = Math.max(1, daysBetweenKeys(today, weekEnd));
  const leftNow = Math.max(0, allowancePerWeek - spentThisWeek);
  for (let i = 1; i <= daysBetweenKeys(today, period.ends_on); i++) {
    const k = addDaysToKey(today, i);
    balance -= k <= weekEnd ? leftNow / daysLeftThisWeek : allowancePerWeek / 7;
    for (const d of dated) if (d.on === k) balance += d.kind === "income" ? d.pence : -d.pence;
    if (balance < -50 && (!low || balance < low.pence)) low = { on: k, pence: Math.round(balance) };
  }

  const next = (kind: PlanItem["kind"]) => {
    const n = dated.find((d) => d.kind === kind && d.on > todayKey);
    return n ? { title: n.title, on: n.on, pence: n.pence } : null;
  };

  return {
    income,
    commitments,
    spentInPeriod: spentBefore + spentThisWeek,
    spentThisWeek,
    weeksRemaining,
    allowancePerWeek,
    leftThisWeek: allowancePerWeek - spentThisWeek,
    leftInPeriod: pool - spentThisWeek,
    nextIncome: next("income"),
    nextCommitment: next("commitment"),
    lowPoint: low,
    weekStart,
  };
}

/** Spending per Monday-week in the period, up to this week (for the weekly chart). */
export function weeklySpend(period: BudgetPeriod, txns: Txn[], todayKey: string) {
  const weeks: Array<{ start: string; pence: number }> = [];
  const last = todayKey < period.ends_on ? todayKey : period.ends_on;
  for (let w = weekStartKey(period.starts_on); w <= last; w = addDaysToKey(w, 7)) {
    const end = addDaysToKey(w, 6);
    const pence = txns
      .filter((t) => t.occurred_on >= w && t.occurred_on <= end && t.occurred_on >= period.starts_on && t.occurred_on <= period.ends_on)
      .reduce((s, t) => s + t.amount_pence, 0);
    weeks.push({ start: w, pence });
  }
  return weeks;
}

export function byCategory(txns: Txn[]) {
  const m = new Map<string, number>();
  for (const t of txns) if (t.amount_pence > 0) m.set(t.category, (m.get(t.category) ?? 0) + t.amount_pence);
  return [...m.entries()].map(([category, pence]) => ({ category, pence })).sort((a, b) => b.pence - a.pence);
}

// ---------------------------------------------------------------------------
// CSV import (bank exports)
// ---------------------------------------------------------------------------

/** RFC-4180-style CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  const endRow = () => {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row.map((f) => f.trim()));
    row = [];
    field = "";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  endRow();
  return rows;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function validDate(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 ? t.toISOString().slice(0, 10) : null;
}

/** UK bank date formats → "yyyy-mm-dd": 18/11/2026, 2026-11-18, 18 Nov 2026, 18-Nov-26. */
export function parseBankDate(input: string): string | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2}|\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

const RULES: Array<[RegExp, string]> = [
  [/tesco|sainsbury|aldi|lidl|asda|co-?op|morrisons|waitrose|iceland/i, "Groceries"],
  [/deliveroo|uber ?eats|just ?eat|domino|papa john/i, "Takeaway"],
  [/trainline|lner|avanti|east midlands railway|stagecoach|arriva|national express|megabus|\buber\b|\bbolt\b/i, "Transport"],
  [/spotify|netflix|apple\.com|amazon prime|disney|youtube|icloud/i, "Subscriptions"],
  [/nando|greggs|pret|costa|starbucks|mcdonald|kfc|subway|wagamama|cafe|café|coffee/i, "Eating out"],
  [/students'? union|\bbar\b|\bpub\b|\bclub\b|fixr|skiddle/i, "Going out"],
  [/\bgym\b|sport|korfball|decathlon|myprotein/i, "Sport"],
];

export function guessCategory(description: string) {
  for (const [re, cat] of RULES) if (re.test(description)) return cat;
  return "Other";
}

export type CsvMapping = { date: number; description: number; amount?: number; moneyOut?: number; moneyIn?: number; outIsNegative: boolean };
export type ImportRow = { occurredOn: string; description: string; amountPence: number; category: string; importKey: string };

/** Guess which columns hold what from the header row. */
export function guessMapping(header: string[]): CsvMapping | null {
  const h = header.map((x) => x.toLowerCase());
  const find = (...names: RegExp[]) => {
    for (const n of names) {
      const i = h.findIndex((x) => n.test(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  const date = find(/^date$/, /date/);
  const description = find(/desc/, /narrative/, /details/, /payee/, /merchant/, /^name$/, /reference/);
  const amount = find(/^amount/, /^value$/);
  const moneyOut = find(/paid out/, /money out/, /debit/, /withdraw/);
  const moneyIn = find(/paid in/, /money in/, /credit/, /deposit/);
  if (date < 0 || description < 0 || (amount < 0 && moneyOut < 0)) return null;
  return {
    date,
    description,
    amount: amount >= 0 ? amount : undefined,
    moneyOut: amount < 0 && moneyOut >= 0 ? moneyOut : undefined,
    moneyIn: amount < 0 && moneyIn >= 0 ? moneyIn : undefined,
    outIsNegative: true,
  };
}

/** Apply a mapping. Rows that don't parse are counted as skipped, never guessed. */
export function mapRows(rows: string[][], m: CsvMapping): { rows: ImportRow[]; skipped: number } {
  const out: ImportRow[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const r of rows) {
    const occurredOn = parseBankDate(r[m.date] ?? "");
    const description = (r[m.description] ?? "").slice(0, 200);
    let pence: number | null = null;
    if (m.amount !== undefined) {
      const v = parseAmount(r[m.amount] ?? "");
      if (v !== null) pence = m.outIsNegative ? -v : v;
    } else {
      const o = m.moneyOut !== undefined ? parseAmount(r[m.moneyOut] ?? "") : null;
      const i = m.moneyIn !== undefined ? parseAmount(r[m.moneyIn] ?? "") : null;
      if (o) pence = Math.abs(o);
      else if (i) pence = -Math.abs(i);
    }
    if (!occurredOn || pence === null || pence === 0) {
      skipped++;
      continue;
    }
    const base = `${occurredOn}|${pence}|${description.toLowerCase().replace(/\s+/g, " ")}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({
      occurredOn,
      description,
      amountPence: pence,
      category: pence > 0 ? guessCategory(description) : "Money in",
      importKey: `${base}#${n}`,
    });
  }
  return { rows: out, skipped };
}
