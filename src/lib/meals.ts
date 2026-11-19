import type { Block } from "./schedule";
import { addDaysToKey, localMinutes } from "./time";

export type Ingredient = { name: string; qty: string; unit: string };
export type Recipe = {
  id: string;
  title: string;
  status: "staple" | "want_to_try" | "cooked";
  portions: number;
  minutes: number | null;
  ingredients: Ingredient[];
  method: string | null;
  protein_g: number | null;
};
export type MealPlanRow = { id: string; on_date: string; recipe_id: string | null; note: string | null };

export const RECIPE_COLUMNS = "id,title,status,portions,minutes,ingredients,method,protein_g";
export const RECIPE_STATUS_LABEL: Record<Recipe["status"], string> = { staple: "Staple", want_to_try: "Want to try", cooked: "Cooked it" };

export type PlannedDay = {
  dateKey: string;
  dinner: { row: MealPlanRow; recipe: Recipe | null } | null;
  /** Leftovers from last night's cook (portions ≥ 2), linked automatically. */
  lunch: { recipe: Recipe } | null;
  busy: { reason: string } | null;
};

const EVENING_FROM = 17 * 60 + 30;
const EVENING_TO = 20 * 60 + 30;

/** A busy evening = something fixed overlapping 17:30–20:30 (late lecture, training, match…). */
export function busyEvening(dayBlocks: Block[], tz: string): { reason: string } | null {
  for (const b of dayBlocks) {
    if (b.cancelled || b.kind === "focus") continue;
    const s = localMinutes(b.startsAt, tz);
    const e = localMinutes(b.endsAt, tz) || 24 * 60;
    if (s < EVENING_TO && e > EVENING_FROM) return { reason: b.title };
  }
  return null;
}

export function planWeek(weekStart: string, rows: MealPlanRow[], recipes: Recipe[], blocksByDay: Map<string, Block[]>, tz: string): PlannedDay[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const byDate = new Map(rows.map((r) => [r.on_date, r]));
  return Array.from({ length: 7 }, (_, i) => {
    const k = addDaysToKey(weekStart, i);
    const row = byDate.get(k);
    const prev = byDate.get(addDaysToKey(k, -1));
    const prevRecipe = prev?.recipe_id ? byId.get(prev.recipe_id) : undefined;
    return {
      dateKey: k,
      dinner: row ? { row, recipe: row.recipe_id ? (byId.get(row.recipe_id) ?? null) : null } : null,
      lunch: prevRecipe && prevRecipe.portions >= 2 ? { recipe: prevRecipe } : null,
      busy: busyEvening(blocksByDay.get(k) ?? [], tz),
    };
  });
}

/** Ingredients for the planned dinners, merged by name + unit. Numeric quantities add up. */
export function shoppingFromPlan(days: PlannedDay[]): Array<{ name: string; qty: string }> {
  const merged = new Map<string, { name: string; unit: string; total: number | null; parts: string[] }>();
  for (const d of days) {
    const r = d.dinner?.recipe;
    if (!r) continue;
    for (const ing of r.ingredients) {
      const name = ing.name.trim();
      if (!name) continue;
      const unit = ing.unit.trim().toLowerCase();
      const key = `${name.toLowerCase()}|${unit}`;
      const n = Number(ing.qty);
      const m = merged.get(key) ?? { name, unit, total: 0, parts: [] };
      if (ing.qty && Number.isFinite(n) && m.total !== null) m.total += n;
      else if (ing.qty) {
        m.total = null;
        m.parts.push(`${ing.qty}${unit ? ` ${unit}` : ""}`);
      }
      merged.set(key, m);
    }
  }
  return [...merged.values()]
    .map((m) => ({
      name: m.name,
      qty: m.total !== null && m.total > 0 ? `${Math.round(m.total * 100) / 100}${m.unit ? ` ${m.unit}` : ""}` : m.parts.join(" + "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
