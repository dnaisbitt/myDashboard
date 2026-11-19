"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteSavingsGoal, deleteTransaction, saveSavingsGoal, saveTransaction } from "@/app/actions/money";
import { BarList, ChartFrame, ColumnChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { SavingsGoal } from "@/lib/data/life";
import { byCategory, CATEGORIES, computeBudget, formatGBP, parseAmount, weeklySpend, type BudgetPeriod, type PlanItem, type Txn } from "@/lib/money";
import { cn } from "@/lib/cn";
import { addDaysToKey, keyLabel } from "@/lib/time";
import { QuickSpend } from "./quick-spend";

export function MoneyOverview({
  period,
  items,
  txns,
  savings,
  goals,
  todayKey,
}: {
  period: BudgetPeriod | null;
  items: PlanItem[];
  txns: Txn[];
  savings: SavingsGoal[];
  goals: Array<{ id: string; title: string }>;
  todayKey: string;
}) {
  const [editing, setEditing] = useState<Txn | null>(null);
  const recentCats = [...new Set(txns.filter((t) => t.amount_pence > 0).map((t) => t.category))].slice(0, 4);

  if (!period) {
    return (
      <div className="flex flex-col gap-10">
        <EmptyState
          title="Set up this term first"
          body="LifeOS works out a weekly allowance from your loan instalment, minus rent and bills, spread over the weeks left in the term. Two minutes to set up; you can log spending straight away too."
          action={
            <Link href="/money/plan" className="inline-flex h-8 items-center rounded-sm bg-ink px-3 text-small font-medium text-canvas">
              Set up the term
            </Link>
          }
        />
        <section className="flex flex-col gap-3">
          <SectionHeader title="Log a spend" />
          <QuickSpend todayKey={todayKey} recentCategories={recentCats} />
        </section>
      </div>
    );
  }

  const b = computeBudget(period, items, txns, todayKey);
  const weeks = weeklySpend(period, txns, todayKey);
  const cats = byCategory(txns.filter((t) => t.occurred_on >= period.starts_on && t.occurred_on <= period.ends_on));
  const over = b.leftThisWeek < 0;
  const recent = txns.slice(0, 15);

  return (
    <div className="flex flex-col gap-12">
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-2">{over ? "Over this week's allowance by" : "Left to spend this week"}</p>
          <p className={cn("font-display text-[clamp(3rem,8vw,4.5rem)] leading-none tracking-[-0.02em]", over && "text-danger")}>
            {formatGBP(Math.abs(b.leftThisWeek), { whole: Math.abs(b.leftThisWeek) >= 10000 })}
          </p>
          <p className="max-w-[48ch] text-body text-ink-2">
            {formatGBP(b.allowancePerWeek, { whole: true })} a week for the {b.weeksRemaining} week{b.weeksRemaining === 1 ? "" : "s"} left in{" "}
            {period.title} (ends {keyLabel(period.ends_on)}). Spent {formatGBP(b.spentThisWeek)} since Monday.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-small">
            {b.lowPoint ? (
              <li className="font-medium text-danger">
                At this pace your balance dips to {formatGBP(b.lowPoint.pence)} around {keyLabel(b.lowPoint.on)}
                {b.nextIncome ? `, before ${b.nextIncome.title.toLowerCase()} lands on ${keyLabel(b.nextIncome.on)}` : ""}.
              </li>
            ) : null}
            {b.nextCommitment ? (
              <li className="text-ink-2">
                Next out: {b.nextCommitment.title} {formatGBP(b.nextCommitment.pence)} on {keyLabel(b.nextCommitment.on)}
              </li>
            ) : null}
            {b.nextIncome ? (
              <li className="text-ink-2">
                Next in: {b.nextIncome.title} {formatGBP(b.nextIncome.pence)} on {keyLabel(b.nextIncome.on)}
              </li>
            ) : null}
            {!items.some((i) => i.kind === "income") ? (
              <li className="text-ink-2">
                No instalment added yet.{" "}
                <Link href="/money/plan" className="underline underline-offset-4 hover:text-ink">
                  Add it
                </Link>{" "}
                to get a real allowance.
              </li>
            ) : null}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <SectionHeader title="Log a spend" />
          <QuickSpend todayKey={todayKey} recentCategories={recentCats} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
        <ChartFrame
          title="Spending by week"
          subtitle={`line = ${formatGBP(b.allowancePerWeek, { whole: true })} allowance`}
          table={{
            columns: ["Week of", "Spent"],
            rows: weeks.map((w) => ({ label: keyLabel(w.start), value: formatGBP(w.pence) })),
          }}
        >
          {weeks.length ? (
            <ColumnChart
              data={weeks.map((w) => ({
                key: w.start,
                label: `Week of ${keyLabel(w.start)}`,
                short: keyLabel(w.start, { day: "numeric", month: "short" }),
                value: Math.max(0, w.pence),
                display: formatGBP(w.pence),
                current: w.start === b.weekStart || (w.start < b.weekStart && addDaysToKey(w.start, 7) > b.weekStart),
                flag: w.pence > b.allowancePerWeek ? "over allowance" : undefined,
              }))}
              reference={{ value: b.allowancePerWeek, label: "allowance" }}
              format={(v) => formatGBP(v, { whole: true })}
            />
          ) : (
            <p className="text-small text-ink-2">No spending logged yet this term.</p>
          )}
        </ChartFrame>
        <ChartFrame
          title="Where it went"
          subtitle={`${period.title}, ${formatGBP(b.spentInPeriod, { whole: true })} so far`}
          table={{ columns: ["Category", "Spent"], rows: cats.map((c) => ({ label: c.category, value: formatGBP(c.pence) })) }}
        >
          {cats.length ? (
            <BarList data={cats.slice(0, 8).map((c) => ({ label: c.category, value: c.pence }))} format={(v) => formatGBP(v, { whole: v >= 10000 })} />
          ) : (
            <p className="text-small text-ink-2">Categories appear once you log a few spends.</p>
          )}
        </ChartFrame>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Recent"
          action={
            <Link href="/money/import" className="text-small text-ink-2 hover:text-ink">
              Import CSV
            </Link>
          }
        />
        {recent.length ? (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {recent.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setEditing(t)} className="flex min-h-11 w-full items-center gap-4 py-2 text-left hover:bg-sunken/40">
                  <span className="w-16 shrink-0 text-small text-ink-2">{keyLabel(t.occurred_on, { day: "numeric", month: "short" })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.note || t.category}</span>
                    {t.note ? <span className="text-micro text-ink-2">{t.category}</span> : null}
                  </span>
                  <span className={cn("text-body", t.amount_pence < 0 && "text-success")}>
                    {t.amount_pence < 0 ? "+" : "−"}
                    {formatGBP(Math.abs(t.amount_pence))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-2">Nothing logged yet. Every spend you log moves the number above.</p>
        )}
      </section>

      <Savings savings={savings} goals={goals} />

      <TxnDialog txn={editing} onClose={() => setEditing(null)} />

      <p className="text-small text-ink-3">
        No bank connection. LifeOS only knows what you log or import, and never stores banking passwords or card details.
      </p>
    </div>
  );
}

function TxnDialog({ txn, onClose }: { txn: Txn | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(txn)} onClose={onClose} title="Edit transaction">
      {txn ? <TxnForm key={txn.id} txn={txn} onClose={onClose} /> : null}
    </Dialog>
  );
}

function TxnForm({ txn, onClose }: { txn: Txn; onClose: () => void }) {
  const [amount, setAmount] = useState((Math.abs(txn.amount_pence) / 100).toFixed(2));
  const [isIn, setIsIn] = useState(txn.amount_pence < 0);
  const [category, setCategory] = useState(txn.category);
  const [note, setNote] = useState(txn.note ?? "");
  const [date, setDate] = useState(txn.occurred_on);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const cats = [...new Set([...CATEGORIES, "Money in", category])];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const p = parseAmount(amount);
        if (!p || p <= 0) return setError("Enter an amount.");
        start(async () => {
          const r = await saveTransaction({ id: txn.id, occurredOn: date, amountPence: isIn ? -p : p, category, note: note || null });
          if (!r.ok) return setError(r.error);
          notify("Saved");
          onClose();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (£)">{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
      <Field label="Category">
        {(id) => (
          <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Note">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}</Field>
      <label className="flex items-center gap-2 text-small text-ink-2">
        <input type="checkbox" checked={isIn} onChange={(e) => setIsIn(e.target.checked)} className="size-4 accent-[var(--ink)]" />
        Money in (refund, transfer)
      </label>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
          Delete
        </Button>
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          Save
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        pending={pending}
        title="Delete this transaction?"
        body={`${formatGBP(Math.abs(txn.amount_pence))} on ${keyLabel(txn.occurred_on)} will be removed.`}
        onConfirm={() =>
          start(async () => {
            const r = await deleteTransaction(txn.id);
            setConfirming(false);
            if (!r.ok) return setError(r.error);
            notify("Deleted");
            onClose();
          })
        }
      />
    </form>
  );
}

function Savings({ savings, goals }: { savings: SavingsGoal[]; goals: Array<{ id: string; title: string }> }) {
  const [editing, setEditing] = useState<SavingsGoal | "new" | null>(null);
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Savings goals"
        action={
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden />
            New
          </Button>
        }
      />
      {savings.length ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {savings.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setEditing(s)} className="grid w-full gap-2 py-3 text-left hover:bg-sunken/40 sm:grid-cols-[1fr_220px] sm:items-center sm:gap-6">
                <span>
                  <span className="block font-medium">{s.title}</span>
                  <span className="text-small text-ink-2">
                    {formatGBP(s.saved_pence, { whole: true })} of {formatGBP(s.target_pence, { whole: true })}
                    {s.target_on ? ` · by ${keyLabel(s.target_on)}` : ""}
                    {s.goal_id && goals.find((g) => g.id === s.goal_id) ? ` · ${goals.find((g) => g.id === s.goal_id)!.title}` : ""}
                  </span>
                </span>
                <ProgressBar value={(s.saved_pence / s.target_pence) * 100} label={`${s.title} saved`} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-2">Saving for a trip, a laptop, a buffer? Add a target and update it when you move money across.</p>
      )}
      <SavingsDialog open={editing !== null} goal={editing && editing !== "new" ? editing : undefined} goals={goals} onClose={() => setEditing(null)} />
    </section>
  );
}

function SavingsDialog({ open, goal, goals, onClose }: { open: boolean; goal?: SavingsGoal; goals: Array<{ id: string; title: string }>; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={goal ? "Savings goal" : "New savings goal"}>
      {open ? <SavingsForm goal={goal} goals={goals} onClose={onClose} /> : null}
    </Dialog>
  );
}

function SavingsForm({ goal, goals, onClose }: { goal?: SavingsGoal; goals: Array<{ id: string; title: string }>; onClose: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [target, setTarget] = useState(goal ? String(goal.target_pence / 100) : "");
  const [saved, setSaved] = useState(goal ? String(goal.saved_pence / 100) : "0");
  const [by, setBy] = useState(goal?.target_on ?? "");
  const [goalId, setGoalId] = useState(goal?.goal_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const t = parseAmount(target);
        const s = parseAmount(saved || "0");
        if (!t || t <= 0) return setError("Enter a target.");
        if (s === null || s < 0) return setError("Enter how much is saved.");
        start(async () => {
          const r = await saveSavingsGoal({ id: goal?.id, title, targetPence: t, savedPence: s, targetOn: by || null, goalId: goalId || null });
          if (!r.ok) return setError(r.error);
          notify("Saved");
          onClose();
        });
      }}
    >
      <Field label="Saving for">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required autoFocus />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target (£)">{(id) => <Input id={id} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />}</Field>
        <Field label="Saved so far (£)">{(id) => <Input id={id} inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="By">{(id) => <Input id={id} type="date" value={by} onChange={(e) => setBy(e.target.value)} />}</Field>
        <Field label="Supports goal">
          {(id) => (
            <Select id={id} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {goal ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:text-danger"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          Save
        </Button>
      </div>
      {goal ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title={`Delete “${goal.title}”?`}
          body="The savings target is removed. No money moves; this only changes what LifeOS tracks."
          onConfirm={() =>
            start(async () => {
              const r = await deleteSavingsGoal(goal.id);
              setConfirming(false);
              notify(r.ok ? "Deleted" : r.error, { tone: r.ok ? "ok" : "error" });
              if (r.ok) onClose();
            })
          }
        />
      ) : null}
    </form>
  );
}
