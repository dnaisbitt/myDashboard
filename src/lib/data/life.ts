import "server-only";
import type { SleepLog } from "@/lib/body";
import { RECIPE_COLUMNS, type MealPlanRow, type Recipe } from "@/lib/meals";
import type { BudgetPeriod, PlanItem, Txn } from "@/lib/money";
import { addDaysToKey, dateKey, weekStartKey } from "@/lib/time";
import { getRange } from "./planner";
import { getClock, getViewer } from "./viewer";

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type SavingsGoal = {
  id: string;
  title: string;
  target_pence: number;
  saved_pence: number;
  target_on: string | null;
  goal_id: string | null;
};

/** The term containing today; otherwise the next one coming up; otherwise the latest. */
function pickPeriod(periods: BudgetPeriod[], todayKey: string) {
  return (
    periods.find((p) => p.starts_on <= todayKey && p.ends_on >= todayKey) ??
    [...periods].filter((p) => p.starts_on > todayKey).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ??
    [...periods].sort((a, b) => b.ends_on.localeCompare(a.ends_on))[0] ??
    null
  );
}

export async function getMoney() {
  const { supabase } = await getViewer();
  const clock = await getClock();
  const [periods, items, savings, goals] = await Promise.all([
    supabase.from("budget_periods").select("id,title,starts_on,ends_on,opening_pence").order("starts_on"),
    supabase.from("money_plan_items").select("id,kind,title,amount_pence,cadence,first_on,last_on,category").order("first_on"),
    supabase.from("savings_goals").select("id,title,target_pence,saved_pence,target_on,goal_id").order("created_at"),
    supabase.from("goals").select("id,title").in("status", ["active", "paused"]).order("title"),
  ]);
  const err = periods.error ?? items.error ?? savings.error ?? goals.error;
  if (err) throw new Error(`Could not load money: ${err.message}`);
  const period = pickPeriod((periods.data ?? []) as BudgetPeriod[], clock.todayKey);

  const from = period ? period.starts_on : addDaysToKey(clock.todayKey, -60);
  const to = period ? period.ends_on : clock.todayKey;
  const txns = await supabase
    .from("transactions")
    .select("id,occurred_on,amount_pence,category,note,source")
    .gte("occurred_on", addDaysToKey(from, -7))
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (txns.error) throw new Error(`Could not load spending: ${txns.error.message}`);

  return {
    ...clock,
    periods: (periods.data ?? []) as BudgetPeriod[],
    period,
    items: (items.data ?? []) as PlanItem[],
    txns: (txns.data ?? []) as Txn[],
    savings: (savings.data ?? []) as SavingsGoal[],
    goals: (goals.data ?? []) as Array<{ id: string; title: string }>,
  };
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export type Workout = { on_date: string; kind: "full" | "minimum" };
export type Checkin = { on_date: string; ate_well: boolean | null; protein_hit: boolean | null; calories: number | null };
export type WeighIn = { on_date: string; kg: number };
export type LiftEntry = { id: string; on_date: string; lift: string; kg: number; reps: number };

export async function getBody() {
  const { supabase } = await getViewer();
  const clock = await getClock();
  const { todayKey } = clock;
  const weekStart = weekStartKey(todayKey);
  const since = addDaysToKey(todayKey, -84);

  const [week, nextWeek, workouts, bookings, sleep, checkins, weights, lifts, done, focus] = await Promise.all([
    getRange(weekStart, addDaysToKey(weekStart, 6)),
    getRange(addDaysToKey(todayKey, 1), addDaysToKey(todayKey, 7)),
    supabase.from("workouts").select("on_date,kind").gte("on_date", since).order("on_date"),
    supabase.from("gym_bookings").select("on_date").gte("on_date", todayKey),
    supabase.from("sleep_logs").select("night_of,bed_at,wake_at").gte("night_of", addDaysToKey(todayKey, -60)).order("night_of"),
    supabase.from("daily_checkins").select("on_date,ate_well,protein_hit,calories").gte("on_date", addDaysToKey(todayKey, -30)).order("on_date"),
    supabase.from("weigh_ins").select("on_date,kg").order("on_date"),
    supabase.from("lift_entries").select("id,on_date,lift,kg,reps").order("on_date").limit(1000),
    supabase.from("tasks").select("completed_at").eq("status", "done").is("parent_id", null).gte("completed_at", `${addDaysToKey(todayKey, -61)}T00:00:00Z`),
    supabase.from("events").select("starts_at,outcome").eq("kind", "focus").not("outcome", "is", null).gte("starts_at", `${addDaysToKey(todayKey, -61)}T00:00:00Z`),
  ]);
  const err = workouts.error ?? bookings.error ?? sleep.error ?? checkins.error ?? weights.error ?? lifts.error ?? done.error ?? focus.error;
  if (err) throw new Error(`Could not load body data: ${err.message}`);

  // Next-day outcomes for the sleep → productivity chain.
  const nextDay = new Map<string, { tasksDone: number; focusStayed: number; focusAnswered: number }>();
  const bump = (k: string) => nextDay.get(k) ?? nextDay.set(k, { tasksDone: 0, focusStayed: 0, focusAnswered: 0 }).get(k)!;
  for (const t of done.data ?? []) bump(dateKey(t.completed_at as string, clock.tz)).tasksDone++;
  for (const f of focus.data ?? []) {
    const d = bump(dateKey(f.starts_at as string, clock.tz));
    d.focusAnswered++;
    if (f.outcome === "stayed") d.focusStayed++;
    else if (f.outcome === "partly") d.focusStayed += 0.5;
  }

  return {
    ...clock,
    weekStart,
    weekBlocks: week.blocks,
    nextWeekBlocks: nextWeek.blocks,
    workouts: (workouts.data ?? []) as Workout[],
    booked: (bookings.data ?? []).map((b) => b.on_date as string),
    sleep: (sleep.data ?? []) as SleepLog[],
    checkins: (checkins.data ?? []) as Checkin[],
    weights: ((weights.data ?? []) as Array<{ on_date: string; kg: number | string }>).map((w) => ({ on_date: w.on_date, kg: Number(w.kg) })),
    lifts: ((lifts.data ?? []) as Array<LiftEntry & { kg: number | string }>).map((l) => ({ ...l, kg: Number(l.kg) })),
    nextDay: [...nextDay.entries()],
  };
}

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------

export type ShoppingItem = { id: string; name: string; qty: string | null; source: "plan" | "manual"; week_of: string | null; checked: boolean };

export async function getFood(weekStart: string) {
  const { supabase } = await getViewer();
  const clock = await getClock();
  const [recipes, plan, shopping, range, inboxShopping] = await Promise.all([
    supabase.from("recipes").select(RECIPE_COLUMNS).order("title"),
    supabase.from("meal_plan").select("id,on_date,recipe_id,note").gte("on_date", addDaysToKey(weekStart, -1)).lte("on_date", addDaysToKey(weekStart, 6)),
    supabase.from("shopping_items").select("id,name,qty,source,week_of,checked").order("checked").order("created_at"),
    getRange(weekStart, addDaysToKey(weekStart, 6)),
    supabase.from("tasks").select("id,title").eq("category", "Shopping").in("status", ["inbox", "open"]).limit(50),
  ]);
  const err = recipes.error ?? plan.error ?? shopping.error ?? inboxShopping.error;
  if (err) throw new Error(`Could not load food: ${err.message}`);
  return {
    ...clock,
    weekStart,
    recipes: (recipes.data ?? []) as Recipe[],
    plan: (plan.data ?? []) as MealPlanRow[],
    shopping: (shopping.data ?? []) as ShoppingItem[],
    blocks: range.blocks,
    shoppingTasks: (inboxShopping.data ?? []) as Array<{ id: string; title: string }>,
  };
}
