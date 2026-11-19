"use client";

import { useRef, useState, useTransition } from "react";
import { saveTransaction } from "@/app/actions/money";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CATEGORIES, formatGBP, parseAmount } from "@/lib/money";

/** Log a spend in a few seconds: amount, one tap on a category, Enter. */
export function QuickSpend({ todayKey, recentCategories, compact }: { todayKey: string; recentCategories: string[]; compact?: boolean }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(recentCategories[0] ?? "Groceries");
  const [note, setNote] = useState("");
  const [moneyIn, setMoneyIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const chips = [...new Set([...recentCategories, ...CATEGORIES])].slice(0, compact ? 6 : 8);

  function save() {
    const p = parseAmount(amount);
    if (!p || p <= 0) return setError("Enter an amount, like 4.50.");
    setError(null);
    start(async () => {
      const r = await saveTransaction({
        occurredOn: todayKey,
        amountPence: moneyIn ? -p : p,
        category: moneyIn ? "Money in" : category,
        note: note || null,
      });
      if (!r.ok) return setError(r.error);
      notify(`${moneyIn ? "Added" : "Logged"} ${formatGBP(p)}${moneyIn ? "" : ` · ${category}`}`);
      setAmount("");
      setNote("");
      input.current?.focus();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <label htmlFor="spend-amount" className="sr-only">
          Amount in pounds
        </label>
        <div className="relative flex-1">
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-lead text-ink-2" aria-hidden>
            £
          </span>
          <input
            ref={input}
            id="spend-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-invalid={Boolean(error)}
            className="h-12 w-full rounded-md border border-rule bg-surface pr-3 pl-8 text-lead placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
        </div>
        <Button type="submit" variant="primary" className="h-12 px-5" pending={pending}>
          {moneyIn ? "Add" : "Log"}
        </Button>
      </div>
      {!moneyIn ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "h-8 rounded-full px-3 text-small transition-colors",
                category === c ? "bg-ink text-canvas" : "bg-sunken text-ink-2 hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="spend-note" className="sr-only">
          Note (optional)
        </label>
        <input
          id="spend-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Note (optional)"
          className="h-9 min-w-0 flex-1 border-b border-rule bg-transparent text-small placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <label className="flex cursor-pointer items-center gap-2 text-small text-ink-2 select-none">
          <input type="checkbox" checked={moneyIn} onChange={(e) => setMoneyIn(e.target.checked)} className="size-4 accent-[var(--ink)]" />
          Money in
        </label>
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
    </form>
  );
}
