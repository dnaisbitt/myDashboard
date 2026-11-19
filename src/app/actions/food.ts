"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dateKeySchema, fail, firstIssue, NOT_SIGNED_IN, uuid } from "@/lib/data/action-utils";
import { getActionViewer } from "@/lib/data/viewer";
import { RECIPE_COLUMNS, shoppingFromPlan, type MealPlanRow, type PlannedDay, type Recipe } from "@/lib/meals";
import { addDaysToKey } from "@/lib/time";
import type { ActionResult } from "@/lib/types";

const recipeSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1, "Name the recipe.").max(120),
  status: z.enum(["staple", "want_to_try", "cooked"]),
  portions: z.number().int().min(1).max(12),
  minutes: z.number().int().min(1).max(600).nullable(),
  proteinG: z.number().int().min(0).max(500).nullable(),
  ingredients: z
    .array(z.object({ name: z.string().trim().max(80), qty: z.string().trim().max(20), unit: z.string().trim().max(20) }))
    .max(60),
  method: z.string().max(10000).nullable(),
});

export async function saveRecipe(input: z.input<typeof recipeSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const r = parsed.data;
  const row = {
    title: r.title,
    status: r.status,
    portions: r.portions,
    minutes: r.minutes,
    protein_g: r.proteinG,
    ingredients: r.ingredients.filter((i) => i.name),
    method: r.method?.trim() || null,
  };
  const res = r.id
    ? await v.supabase.from("recipes").update(row).eq("id", r.id).select("id").single()
    : await v.supabase.from("recipes").insert(row).select("id").single();
  if (res.error) return fail("Couldn't save the recipe.", res.error);
  refresh();
  return { ok: true, data: { id: res.data.id } };
}

export async function deleteRecipe(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown recipe.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("recipes").delete().eq("id", id);
  if (error) return fail("Couldn't delete the recipe.", error);
  refresh();
  return { ok: true };
}

/** Plan a dinner (recipe or a free-text note) for an evening, or clear it. */
export async function setDinner(onDate: string, plan: { recipeId: string | null; note: string | null } | null): Promise<ActionResult> {
  if (!dateKeySchema.safeParse(onDate).success) return fail("Pick a day.");
  if (plan && plan.recipeId !== null && !uuid.safeParse(plan.recipeId).success) return fail("Unknown recipe.");
  if (plan && plan.note && plan.note.length > 120) return fail("Keep the note short.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } =
    !plan || (!plan.recipeId && !plan.note?.trim())
      ? await v.supabase.from("meal_plan").delete().eq("on_date", onDate)
      : await v.supabase
          .from("meal_plan")
          .upsert({ on_date: onDate, recipe_id: plan.recipeId, note: plan.note?.trim() || null }, { onConflict: "user_id,on_date" });
  if (error) return fail("Couldn't update the plan.", error);
  refresh();
  return { ok: true };
}

/** Mark a recipe as cooked (moves "want to try" → "cooked it"). */
export async function markCooked(recipeId: string): Promise<ActionResult> {
  if (!uuid.safeParse(recipeId).success) return fail("Unknown recipe.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("recipes").update({ status: "cooked" }).eq("id", recipeId).eq("status", "want_to_try");
  if (error) return fail("Couldn't update the recipe.", error);
  refresh();
  return { ok: true };
}

/**
 * Rebuild the week's generated shopping items from the meal plan.
 * Manual items and anything already ticked are kept.
 */
export async function buildShoppingList(weekStart: string): Promise<ActionResult<{ count: number }>> {
  if (!dateKeySchema.safeParse(weekStart).success) return fail("Unknown week.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const [plan, recipes] = await Promise.all([
    v.supabase.from("meal_plan").select("id,on_date,recipe_id,note").gte("on_date", weekStart).lte("on_date", addDaysToKey(weekStart, 6)),
    v.supabase.from("recipes").select(RECIPE_COLUMNS),
  ]);
  if (plan.error || recipes.error) return fail("Couldn't read the plan.", plan.error ?? recipes.error);
  const byId = new Map(((recipes.data ?? []) as Recipe[]).map((r) => [r.id, r]));
  const days: PlannedDay[] = ((plan.data ?? []) as MealPlanRow[]).map((row) => ({
    dateKey: row.on_date,
    dinner: { row, recipe: row.recipe_id ? (byId.get(row.recipe_id) ?? null) : null },
    lunch: null,
    busy: null,
  }));
  const items = shoppingFromPlan(days);
  const del = await v.supabase.from("shopping_items").delete().eq("source", "plan").eq("week_of", weekStart).eq("checked", false);
  if (del.error) return fail("Couldn't refresh the list.", del.error);
  if (items.length) {
    const { error } = await v.supabase
      .from("shopping_items")
      .insert(items.map((i) => ({ name: i.name, qty: i.qty || null, source: "plan", week_of: weekStart })));
    if (error) return fail("Couldn't build the list.", error);
  }
  refresh();
  return { ok: true, data: { count: items.length } };
}

const itemSchema = z.object({ name: z.string().trim().min(1, "What do you need?").max(120), qty: z.string().trim().max(40).nullable() });

export async function addShoppingItem(input: z.input<typeof itemSchema>): Promise<ActionResult> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("shopping_items").insert({ name: parsed.data.name, qty: parsed.data.qty || null, source: "manual" });
  if (error) return fail("Couldn't add it.", error);
  refresh();
  return { ok: true };
}

export async function toggleShoppingItem(id: string, checked: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown item.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("shopping_items").update({ checked }).eq("id", id);
  if (error) return fail("Couldn't update it.", error);
  refresh();
  return { ok: true };
}

export async function clearCheckedShopping(): Promise<ActionResult<{ removed: number }>> {
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { data, error } = await v.supabase.from("shopping_items").delete().eq("checked", true).select("id");
  if (error) return fail("Couldn't clear the list.", error);
  refresh();
  return { ok: true, data: { removed: data?.length ?? 0 } };
}
