"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dateKeySchema, fail, firstIssue, NOT_SIGNED_IN, uuid } from "@/lib/data/action-utils";
import { getActionViewer } from "@/lib/data/viewer";
import type { ActionResult } from "@/lib/types";

const pence = z.number().int();
const category = z.string().trim().min(1).max(40);

// ---------------------------------------------------------------------------
// Spending (a few seconds: amount + category)
// ---------------------------------------------------------------------------

const txnSchema = z.object({
  id: uuid.optional(),
  occurredOn: dateKeySchema,
  amountPence: pence.refine((v) => v !== 0 && Math.abs(v) <= 100000000, "Enter an amount."),
  category,
  note: z.string().trim().max(200).nullable(),
});

export async function saveTransaction(input: z.input<typeof txnSchema>): Promise<ActionResult> {
  const parsed = txnSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const t = parsed.data;
  const row = { occurred_on: t.occurredOn, amount_pence: t.amountPence, category: t.category, note: t.note || null };
  const { error } = t.id
    ? await v.supabase.from("transactions").update(row).eq("id", t.id)
    : await v.supabase.from("transactions").insert(row);
  if (error) return fail("Couldn't save that.", error);
  refresh();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown transaction.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("transactions").delete().eq("id", id);
  if (error) return fail("Couldn't delete it.", error);
  refresh();
  return { ok: true };
}

const importSchema = z
  .array(
    z.object({
      occurredOn: dateKeySchema,
      description: z.string().max(200),
      amountPence: pence.refine((v) => v !== 0),
      category,
      importKey: z.string().min(1).max(400),
    }),
  )
  .min(1, "Nothing to import.")
  .max(2000, "That's over 2,000 rows. Export a shorter date range.");

/** CSV import. Rows already imported (same date, amount, description) are skipped. */
export async function importTransactions(rows: z.input<typeof importSchema>): Promise<ActionResult<{ added: number; duplicates: number }>> {
  const parsed = importSchema.safeParse(rows);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  let added = 0;
  for (let i = 0; i < parsed.data.length; i += 250) {
    const batch = parsed.data.slice(i, i + 250).map((r) => ({
      occurred_on: r.occurredOn,
      amount_pence: r.amountPence,
      category: r.category,
      note: r.description || null,
      source: "csv",
      import_key: r.importKey,
    }));
    const { data, error } = await v.supabase
      .from("transactions")
      .upsert(batch, { onConflict: "user_id,import_key", ignoreDuplicates: true })
      .select("id");
    if (error) return fail(`Imported ${added} before an error. Try again; duplicates are skipped.`, error);
    added += data?.length ?? 0;
  }
  refresh();
  return { ok: true, data: { added, duplicates: parsed.data.length - added } };
}

// ---------------------------------------------------------------------------
// Term budget
// ---------------------------------------------------------------------------

const periodSchema = z
  .object({
    id: uuid.optional(),
    title: z.string().trim().min(1, "Name it, e.g. “Autumn term”.").max(80),
    startsOn: dateKeySchema,
    endsOn: dateKeySchema,
    openingPence: pence.min(-10000000).max(100000000),
  })
  .refine((p) => p.endsOn > p.startsOn, { message: "The end has to be after the start." });

export async function savePeriod(input: z.input<typeof periodSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const p = parsed.data;
  const row = { title: p.title, starts_on: p.startsOn, ends_on: p.endsOn, opening_pence: p.openingPence };
  const res = p.id
    ? await v.supabase.from("budget_periods").update(row).eq("id", p.id).select("id").single()
    : await v.supabase.from("budget_periods").insert(row).select("id").single();
  if (res.error) return fail("Couldn't save the term.", res.error);
  refresh();
  return { ok: true, data: { id: res.data.id } };
}

export async function deletePeriod(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown term.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("budget_periods").delete().eq("id", id);
  if (error) return fail("Couldn't delete the term.", error);
  refresh();
  return { ok: true };
}

const itemSchema = z
  .object({
    id: uuid.optional(),
    kind: z.enum(["income", "commitment"]),
    title: z.string().trim().min(1, "Name it.").max(80),
    amountPence: pence.min(1, "Enter an amount.").max(100000000),
    cadence: z.enum(["once", "weekly", "monthly"]),
    firstOn: dateKeySchema,
    lastOn: dateKeySchema.nullable(),
  })
  .refine((i) => !i.lastOn || i.lastOn >= i.firstOn, { message: "The last date must be after the first." });

export async function savePlanItem(input: z.input<typeof itemSchema>): Promise<ActionResult> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const i = parsed.data;
  const row = { kind: i.kind, title: i.title, amount_pence: i.amountPence, cadence: i.cadence, first_on: i.firstOn, last_on: i.cadence === "once" ? null : i.lastOn };
  const { error } = i.id
    ? await v.supabase.from("money_plan_items").update(row).eq("id", i.id)
    : await v.supabase.from("money_plan_items").insert(row);
  if (error) return fail("Couldn't save that.", error);
  refresh();
  return { ok: true };
}

export async function deletePlanItem(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown item.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("money_plan_items").delete().eq("id", id);
  if (error) return fail("Couldn't delete it.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

const savingSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1, "Name it.").max(80),
  targetPence: pence.min(1, "Enter a target.").max(100000000),
  savedPence: pence.min(0).max(100000000),
  targetOn: dateKeySchema.nullable(),
  goalId: uuid.nullable(),
});

export async function saveSavingsGoal(input: z.input<typeof savingSchema>): Promise<ActionResult> {
  const parsed = savingSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const s = parsed.data;
  const row = { title: s.title, target_pence: s.targetPence, saved_pence: s.savedPence, target_on: s.targetOn, goal_id: s.goalId };
  const { error } = s.id
    ? await v.supabase.from("savings_goals").update(row).eq("id", s.id)
    : await v.supabase.from("savings_goals").insert(row);
  if (error) return fail("Couldn't save the savings goal.", error);
  refresh();
  return { ok: true };
}

export async function deleteSavingsGoal(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown savings goal.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("savings_goals").delete().eq("id", id);
  if (error) return fail("Couldn't delete it.", error);
  refresh();
  return { ok: true };
}
