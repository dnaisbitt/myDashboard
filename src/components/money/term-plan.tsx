"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { deletePeriod, deletePlanItem, savePeriod, savePlanItem } from "@/app/actions/money";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatGBP, occurrences, parseAmount, type BudgetPeriod, type PlanItem } from "@/lib/money";
import { addDaysToKey, keyLabel } from "@/lib/time";

const CADENCE: Record<PlanItem["cadence"], string> = { once: "Once", weekly: "Every week", monthly: "Every month" };

export function TermPlan({ periods, period, items, todayKey }: { periods: BudgetPeriod[]; period: BudgetPeriod | null; items: PlanItem[]; todayKey: string }) {
  const [editingPeriod, setEditingPeriod] = useState<BudgetPeriod | "new" | null>(period ? null : "new");
  const [editingItem, setEditingItem] = useState<{ item?: PlanItem; kind: PlanItem["kind"] } | null>(null);

  const list = (kind: PlanItem["kind"]) => {
    const mine = items.filter((i) => i.kind === kind);
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader
          title={kind === "income" ? "Money in" : "Committed money out"}
          count={mine.length || undefined}
          action={
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingItem({ kind })}>
              <Plus size={14} aria-hidden />
              Add
            </Button>
          }
        />
        {mine.length ? (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {mine.map((i) => {
              const inTerm = period ? occurrences(i, period.starts_on, period.ends_on).length : 0;
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => setEditingItem({ item: i, kind })} className="flex min-h-12 w-full items-center gap-4 py-2 text-left hover:bg-sunken/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.title}</span>
                      <span className="text-small text-ink-2">
                        {CADENCE[i.cadence]}
                        {i.cadence === "once" ? ` · ${keyLabel(i.first_on)}` : ` from ${keyLabel(i.first_on)}`}
                        {period && i.cadence !== "once" ? ` · ${inTerm}× this term` : ""}
                      </span>
                    </span>
                    <span >{formatGBP(i.amount_pence)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-small text-ink-2">
            {kind === "income"
              ? "Add your maintenance loan instalment for this term (the date it lands and the amount). Add summer savings as the term's opening balance instead."
              : "Rent, bills, phone, subscriptions: anything that leaves on a schedule whether you think about it or not."}
          </p>
        )}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Term"
          action={
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingPeriod("new")}>
              <Plus size={14} aria-hidden />
              New term
            </Button>
          }
        />
        {periods.length ? (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {periods.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setEditingPeriod(p)} className="flex min-h-12 w-full items-center gap-4 py-2 text-left hover:bg-sunken/40">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {p.title}
                      {p.id === period?.id ? <span className="ml-2 text-small font-normal text-ink-2">current</span> : null}
                    </span>
                    <span className="text-small text-ink-2">
                      {keyLabel(p.starts_on)} – {keyLabel(p.ends_on)}
                    </span>
                  </span>
                  <span className="text-small text-ink-2">opening {formatGBP(p.opening_pence, { whole: true })}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-2">Start with the term you&apos;re in now.</p>
        )}
      </section>
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        {list("income")}
        {list("commitment")}
      </div>

      <PeriodDialog value={editingPeriod} onClose={() => setEditingPeriod(null)} todayKey={todayKey} />
      <ItemDialog value={editingItem} onClose={() => setEditingItem(null)} todayKey={todayKey} />
    </div>
  );
}

function PeriodDialog({ value, onClose, todayKey }: { value: BudgetPeriod | "new" | null; onClose: () => void; todayKey: string }) {
  const p = value && value !== "new" ? value : undefined;
  return (
    <Dialog open={value !== null} onClose={onClose} title={p ? "Edit term" : "Set up a term"} description="The allowance spreads what's left over the weeks of this term.">
      {value !== null ? <PeriodForm key={p?.id ?? "new"} period={p} onClose={onClose} todayKey={todayKey} /> : null}
    </Dialog>
  );
}

function PeriodForm({ period, onClose, todayKey }: { period?: BudgetPeriod; onClose: () => void; todayKey: string }) {
  const [title, setTitle] = useState(period?.title ?? "");
  const [start, setStart] = useState(period?.starts_on ?? todayKey);
  const [end, setEnd] = useState(period?.ends_on ?? addDaysToKey(todayKey, 7 * 10));
  const [opening, setOpening] = useState(period ? String(period.opening_pence / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startT] = useTransition();
  const { notify } = useToast();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const o = parseAmount(opening || "0");
        if (o === null) return setError("Enter the opening balance in pounds.");
        startT(async () => {
          const r = await savePeriod({ id: period?.id, title, startsOn: start, endsOn: end, openingPence: o });
          if (!r.ok) return setError(r.error);
          notify("Term saved");
          onClose();
        });
      }}
    >
      <Field label="Name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Autumn term" maxLength={80} required autoFocus />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">{(id) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} required />}</Field>
        <Field label="Ends" hint="Until the next instalment">
          {(id, d) => <Input id={id} aria-describedby={d} type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />}
        </Field>
      </div>
      <Field label="Opening balance (£)" hint="What you had when the term started, including summer savings you're willing to spend.">
        {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />}
      </Field>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {period ? (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          Save
        </Button>
      </div>
      {period ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title="Delete this term?"
          body="The term's dates and opening balance are removed. Transactions, income and commitments are kept."
          onConfirm={() =>
            startT(async () => {
              const r = await deletePeriod(period.id);
              setConfirming(false);
              if (!r.ok) return setError(r.error);
              notify("Term deleted");
              onClose();
            })
          }
        />
      ) : null}
    </form>
  );
}

function ItemDialog({ value, onClose, todayKey }: { value: { item?: PlanItem; kind: PlanItem["kind"] } | null; onClose: () => void; todayKey: string }) {
  const title = value?.kind === "income" ? (value.item ? "Money in" : "Add money in") : value?.item ? "Commitment" : "Add a commitment";
  return (
    <Dialog open={value !== null} onClose={onClose} title={title}>
      {value ? <ItemForm key={value.item?.id ?? value.kind} item={value.item} kind={value.kind} onClose={onClose} todayKey={todayKey} /> : null}
    </Dialog>
  );
}

function ItemForm({ item, kind, onClose, todayKey }: { item?: PlanItem; kind: PlanItem["kind"]; onClose: () => void; todayKey: string }) {
  const [title, setTitle] = useState(item?.title ?? (kind === "income" ? "Maintenance loan instalment" : ""));
  const [amount, setAmount] = useState(item ? String(item.amount_pence / 100) : "");
  const [cadence, setCadence] = useState<PlanItem["cadence"]>(item?.cadence ?? (kind === "income" ? "once" : "monthly"));
  const [first, setFirst] = useState(item?.first_on ?? todayKey);
  const [last, setLast] = useState(item?.last_on ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const p = parseAmount(amount);
        if (!p || p <= 0) return setError("Enter an amount.");
        start(async () => {
          const r = await savePlanItem({ id: item?.id, kind, title, amountPence: p, cadence, firstOn: first, lastOn: last || null });
          if (!r.ok) return setError(r.error);
          notify("Saved");
          onClose();
        });
      }}
    >
      <Field label="What">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required placeholder={kind === "income" ? "" : "Rent"} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (£)">{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />}</Field>
        <Field label="How often">
          {(id) => (
            <Select id={id} value={cadence} onChange={(e) => setCadence(e.target.value as PlanItem["cadence"])}>
              {Object.entries(CADENCE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={cadence === "once" ? "Date" : "First date"}>{(id) => <Input id={id} type="date" value={first} onChange={(e) => setFirst(e.target.value)} required />}</Field>
        {cadence !== "once" ? (
          <Field label="Last date" hint="Optional">
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={last} onChange={(e) => setLast(e.target.value)} />}
          </Field>
        ) : null}
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {item ? (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          Save
        </Button>
      </div>
      {item ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title={`Delete “${item.title}”?`}
          body="It stops counting toward your allowance."
          onConfirm={() =>
            start(async () => {
              const r = await deletePlanItem(item.id);
              setConfirming(false);
              if (!r.ok) return setError(r.error);
              notify("Deleted");
              onClose();
            })
          }
        />
      ) : null}
    </form>
  );
}
