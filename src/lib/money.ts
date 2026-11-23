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

/** Typed amounts: "4.5" | "£4.50" | "4,50" | "1,204" | "-3" → pence; null if not a number. */
export function parseAmount(input: string): number | null {
  return parseBankAmount(input)?.pence ?? null;
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

/** File bytes → text. Banks often export Windows-1252 (where "£" is one byte), not UTF-8. */
export function decodeCsvBytes(buf: ArrayBuffer): { text: string; encoding: string } {
  const b = new Uint8Array(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(b.subarray(3)), encoding: "UTF-8" };
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(b.subarray(2)), encoding: "UTF-16" };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(b.subarray(2)), encoding: "UTF-16" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(b), encoding: "Windows-1252" };
  }
}

/** Which character separates columns: comma, semicolon, tab or pipe (counted outside quotes). */
export function detectDelimiter(text: string): "," | ";" | "\t" | "|" {
  const line = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c in counts) counts[c]++;
  }
  const best = (Object.keys(counts) as Array<"," | ";" | "\t" | "|">).reduce((a, b) => (counts[b] > counts[a] ? b : a), ",");
  return counts[best] > 0 ? best : ",";
}

export const DELIMITER_NAME: Record<string, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };

/** RFC-4180-style CSV with a configurable separator: quoted fields, escaped quotes, separators/newlines in quotes. */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
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
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  endRow();
  // Drop trailing columns that are empty in every row (from a trailing separator).
  const width = Math.max(0, ...rows.map((r) => r.length));
  let keep = width;
  while (keep > 0 && rows.every((r) => !(r[keep - 1] ?? "").trim())) keep--;
  return keep < width ? rows.map((r) => r.slice(0, keep)) : rows;
}

/**
 * Bank amount text → signed pence, plus whether the text carried an explicit sign.
 * Handles "£12.40", "-12,40", "1.234,56", "1,234.56", "(12.40)", "12.40 DR", "12.40 CR", "+3000", "GBP 5".
 */
export function parseBankAmount(input: string): { pence: number; signed: boolean } | null {
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  let signed = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    signed = true;
    s = s.slice(1, -1);
  }
  const suffix = s.match(/\s*\b(DR|CR)\.?$/i);
  if (suffix) {
    signed = true;
    if (suffix[1].toUpperCase() === "DR") negative = true;
    s = s.slice(0, suffix.index).trim();
  }
  s = s.replace(/GBP|EUR|USD/gi, "").replace(/[^\d.,+\-\u2212\u2013]/g, "");
  if (/^[-−–]/.test(s) || /-$/.test(s)) {
    negative = true;
    signed = true;
    s = s.replace(/^[-−–]|-$/g, "");
  } else if (s.startsWith("+")) {
    signed = true;
    s = s.slice(1);
  }
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal point.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Only commas: "12,40" is a decimal comma; "1,204" is thousands.
    s = /,\d{1,2}$/.test(s) && s.split(",").length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, ""); // "1.234.567"
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const pence = Math.round(Number(s) * 100);
  return { pence: negative ? -pence : pence, signed };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function validDate(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 ? t.toISOString().slice(0, 10) : null;
}

/** UK bank date formats → "yyyy-mm-dd": 18/11/2026, 18.11.2026, 2026-11-18, 18 Nov 2026, 18-Nov-26; a trailing time is ignored. */
export function parseBankDate(input: string): string | null {
  const s = input.trim().replace(/^"|"$/g, "");
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T,].*)?$/);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2}|\d{4})(?:[ T,].*)?$/);
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

/** Direction words banks put in a "Type" column. */
const TYPE_IN = /\bcredit\b|\bcr\b|deposit|refund|incoming|received|money in|paid in|salary|interest|reversal|faster payment in|transfer in/i;
const TYPE_OUT = /\bdebit\b|\bdr\b|payment|purchase|card|withdrawal|\batm\b|cash|standing order|transfer out|money out|paid out|\bfee\b|charge/i;

export function directionFromType(value: string): "in" | "out" | null {
  if (!value.trim()) return null;
  // "Direct debit", "Card payment" etc. are out; check "in" words only if no "out" words win.
  const out = TYPE_OUT.test(value);
  const inn = TYPE_IN.test(value);
  if (out && !inn) return "out";
  if (inn && !out) return "in";
  return null;
}

export type CsvMapping = {
  date: number;
  description: number;
  amount?: number;
  moneyOut?: number;
  moneyIn?: number;
  /** Optional "Type" column used to tell money in from money out when amounts carry no sign. */
  type?: number;
  outIsNegative: boolean;
};
export type ImportRow = { occurredOn: string; description: string; amountPence: number; category: string; importKey: string };

/** Guess which columns hold what from the header, using a sample of rows to work out the sign convention. */
export function guessMapping(header: string[], sample: string[][] = []): CsvMapping | null {
  const h = header.map((x) => x.toLowerCase().trim());
  const find = (...names: RegExp[]) => {
    for (const n of names) {
      const i = h.findIndex((x) => n.test(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  const date = find(/^date$/, /transaction date/, /date/);
  const description = find(/desc/, /narrative/, /details/, /payee/, /merchant/, /^name$/, /counter ?party/, /reference/, /memo/);
  // A single signed column first: "Amount", "Debit/Credit", "Value"…
  const amount = find(/^amount/, /debit\s*\/\s*credit/, /credit\s*\/\s*debit/, /transaction amount/, /amount/, /^value$/);
  const moneyOut = find(/paid out/, /money out/, /^debit/, /withdraw/, /out$/);
  const moneyIn = find(/paid in/, /money in/, /^credit/, /deposit/, /in$/);
  const type = find(/^type$/, /transaction type/, /dr\/cr/, /^cr\/dr/, /direction/);
  if (date < 0 || description < 0 || (amount < 0 && moneyOut < 0)) return null;

  let outIsNegative = true;
  let useType = false;
  if (amount >= 0 && sample.length) {
    const parsed = sample.map((r) => parseBankAmount(r[amount] ?? "")).filter((p): p is { pence: number; signed: boolean } => p !== null);
    const anyNegative = parsed.some((p) => p.pence < 0);
    // Signed amounts decide direction on their own. Only when every amount is
    // unsigned is the Type column needed; with no Type column, positive = spending.
    if (parsed.length && !anyNegative) {
      if (type >= 0) useType = true;
      else outIsNegative = false;
    }
  }
  return {
    date,
    description,
    amount: amount >= 0 ? amount : undefined,
    moneyOut: amount < 0 && moneyOut >= 0 ? moneyOut : undefined,
    moneyIn: amount < 0 && moneyIn >= 0 ? moneyIn : undefined,
    type: useType && type !== description ? type : undefined,
    outIsNegative,
  };
}

/** Apply a mapping. Rows that don't parse are counted as skipped, never guessed. Positive result = money out. */
export function mapRows(
  rows: string[][],
  m: CsvMapping,
): { rows: ImportRow[]; skipped: number; reasons: Array<{ line: number; reason: string }> } {
  const out: ImportRow[] = [];
  const seen = new Map<string, number>();
  const reasons: Array<{ line: number; reason: string }> = [];
  let skipped = 0;
  let line = 1;
  for (const r of rows) {
    line++;
    const occurredOn = parseBankDate(r[m.date] ?? "");
    const description = (r[m.description] ?? "").slice(0, 200);
    let pence: number | null = null;
    if (m.amount !== undefined) {
      const v = parseBankAmount(r[m.amount] ?? "");
      if (v) {
        const dir = m.type !== undefined ? directionFromType(r[m.type] ?? "") : null;
        if (!v.signed && dir) pence = dir === "out" ? Math.abs(v.pence) : -Math.abs(v.pence);
        else pence = m.outIsNegative ? -v.pence : v.pence;
      }
    } else {
      const o = m.moneyOut !== undefined ? parseBankAmount(r[m.moneyOut] ?? "") : null;
      const i = m.moneyIn !== undefined ? parseBankAmount(r[m.moneyIn] ?? "") : null;
      if (o && o.pence) pence = Math.abs(o.pence);
      else if (i && i.pence) pence = -Math.abs(i.pence);
    }
    if (!occurredOn || pence === null || pence === 0) {
      skipped++;
      if (reasons.length < 3) {
        const amountText = m.amount !== undefined ? r[m.amount] : (r[m.moneyOut ?? -1] || r[m.moneyIn ?? -1]);
        reasons.push({
          line,
          reason: !occurredOn
            ? `date “${(r[m.date] ?? "").slice(0, 30)}” isn't a date it recognises`
            : pence === 0
              ? "amount is zero"
              : `amount “${(amountText ?? "").slice(0, 30)}” couldn't be read`,
        });
      }
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
  return { rows: out, skipped, reasons };
}
