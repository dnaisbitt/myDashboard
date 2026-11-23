"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addShoppingItem, buildShoppingList, clearCheckedShopping, markCooked, setDinner, toggleShoppingItem } from "@/app/actions/food";
import { setTaskDone } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { TaskCheck } from "@/components/ui/checkbox";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { Chip } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Checkin, ShoppingItem } from "@/lib/data/life";
import { planWeek, type MealPlanRow, type Recipe } from "@/lib/meals";
import type { Block } from "@/lib/schedule";
import { addDaysToKey, keyLabel } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { FoodCheckins } from "./checkins";
import { RecipeView } from "./recipe-view";

export function Meals({
  profile,
  weekStart,
  todayKey,
  recipes,
  plan,
  blocks,
  shopping,
  shoppingTasks,
  today,
  tz,
}: {
  profile: Profile;
  weekStart: string;
  todayKey: string;
  recipes: Recipe[];
  plan: MealPlanRow[];
  blocks: Block[];
  shopping: ShoppingItem[];
  shoppingTasks: Array<{ id: string; title: string }>;
  today: Checkin | null;
  tz: string;
}) {
  const byDay = new Map<string, Block[]>();
  for (const b of blocks) byDay.set(b.dateKey, [...(byDay.get(b.dateKey) ?? []), b]);
  const days = planWeek(weekStart, plan, recipes, byDay, tz);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const planned = days.filter((d) => d.dinner).length;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/body/meals?week=${addDaysToKey(weekStart, -7)}`} aria-label="Previous week" className="grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-sunken">
            <ChevronLeft size={18} aria-hidden />
          </Link>
          <Link href={`/body/meals?week=${addDaysToKey(weekStart, 7)}`} aria-label="Next week" className="grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-sunken">
            <ChevronRight size={18} aria-hidden />
          </Link>
          <h2 className="font-display text-title">Week of {keyLabel(weekStart, { day: "numeric", month: "long" })}</h2>
          <span className="text-small text-ink-2">{planned}/7 dinners planned</span>
        </div>
        {!recipes.length ? (
          <EmptyState
            title="Add a couple of staples first"
            body="Cooking 2 portions makes tonight's dinner tomorrow's lunch automatically."
            action={
              <Link href="/body/recipes" className="inline-flex h-8 items-center rounded-sm bg-ink px-3 text-small font-medium text-canvas">
                Add recipes
              </Link>
            }
          />
        ) : null}
        <ol className="flex flex-col divide-y divide-rule border-y border-rule">
          {days.map((d) => (
            <DayRow key={d.dateKey} day={d} recipes={recipes} isToday={d.dateKey === todayKey} past={d.dateKey < todayKey} />
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        <section className="flex flex-col gap-2">
          <SectionHeader title="Today" />
          <FoodCheckins profile={profile} today={today} todayKey={todayKey} />
        </section>

        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Shopping list"
            action={
              <Button
                size="sm"
                variant="secondary"
                pending={pending}
                onClick={() =>
                  start(async () => {
                    const r = await buildShoppingList(weekStart);
                    notify(r.ok ? (r.data!.count ? `${r.data!.count} items from this week's plan` : "No ingredients in this week's recipes yet") : r.error, {
                      tone: r.ok ? "ok" : "error",
                    });
                  })
                }
              >
                Build from plan
              </Button>
            }
          />
          <Shopping items={shopping} tasks={shoppingTasks} />
        </section>
      </div>
    </div>
  );
}

function DayRow({ day, recipes, isToday, past }: { day: ReturnType<typeof planWeek>[number]; recipes: Recipe[]; isToday: boolean; past: boolean }) {
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const [note, setNote] = useState(day.dinner?.row.note ?? "");
  const [viewing, setViewing] = useState<Recipe | null>(null);
  const recipe = day.dinner?.recipe ?? null;
  const ordered = [...recipes].sort(
    (a, b) =>
      Number(Boolean(day.busy) && (b.minutes ?? 99) <= 20) - Number(Boolean(day.busy) && (a.minutes ?? 99) <= 20) ||
      (a.status === "staple" ? -1 : 0) - (b.status === "staple" ? -1 : 0) ||
      a.title.localeCompare(b.title),
  );
  const set = (plan: { recipeId: string | null; note: string | null } | null) =>
    start(async () => {
      const r = await setDinner(day.dateKey, plan);
      if (!r.ok) notify(r.error, { tone: "error" });
    });

  return (
    <li className={cn("grid gap-2 py-3 sm:grid-cols-[120px_1fr_1fr] sm:items-center sm:gap-6", past && "opacity-70")}>
      <div>
        <p className={cn("font-medium", isToday && "underline decoration-2 underline-offset-4")}>{keyLabel(day.dateKey, { weekday: "long" })}</p>
        <p className="text-micro text-ink-2">{keyLabel(day.dateKey, { day: "numeric", month: "short" })}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="sr-only" htmlFor={`dinner-${day.dateKey}`}>
          Dinner on {keyLabel(day.dateKey)}
        </label>
        <div className="flex items-center gap-2">
          <select
            id={`dinner-${day.dateKey}`}
            value={recipe?.id ?? (day.dinner?.row.note ? "__note" : "")}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") set(null);
              else if (v !== "__note") set({ recipeId: v, note: null });
            }}
            className="h-9 min-w-0 flex-1 rounded-sm border border-rule bg-surface px-2 text-small focus:border-ink focus:outline-none"
          >
            <option value="">Dinner: not planned</option>
            {day.dinner?.row.note ? <option value="__note">Dinner: see note</option> : null}
            {ordered.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.minutes ? ` · ${r.minutes} min` : ""}
                {r.status === "want_to_try" ? " · new" : ""}
              </option>
            ))}
          </select>
          {recipe ? (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setViewing(recipe)}>
              View
            </Button>
          ) : null}
          {recipe && recipe.status === "want_to_try" && (past || isToday) ? (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => start(async () => void (await markCooked(recipe.id)))}>
              Cooked it
            </Button>
          ) : null}
        </div>
        {!recipe ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set(note.trim() ? { recipeId: null, note } : null);
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (day.dinner?.row.note ?? "") && set(note.trim() ? { recipeId: null, note } : null)}
              maxLength={120}
              placeholder="Or add a note"
              aria-label={`Dinner note for ${keyLabel(day.dateKey)}`}
              className="h-8 w-full border-b border-rule bg-transparent text-small placeholder:text-ink-3 focus:border-ink focus:outline-none"
            />
          </form>
        ) : null}
        {day.busy ? (
          <p className="text-micro text-ink-2">
            Busy evening ({day.busy.reason}). Pick something quick{recipe && (recipe.minutes ?? 0) > 20 ? `; ${recipe.title} takes ${recipe.minutes} min` : ""}.
          </p>
        ) : null}
      </div>
      <div className="text-small">
        {day.lunch ? (
          <p>
            <span className="text-ink-2">Lunch:</span>{" "}
            <button type="button" onClick={() => setViewing(day.lunch!.recipe)} className="underline decoration-rule underline-offset-4 hover:decoration-ink">
              {day.lunch.recipe.title}
            </button>{" "}
            <span className="text-ink-2">(leftovers)</span>
          </p>
        ) : (
          <p className="text-ink-3">Lunch: nothing cooked the night before</p>
        )}
      </div>
      <RecipeView recipe={viewing} onClose={() => setViewing(null)} />
    </li>
  );
}

function Shopping({ items, tasks }: { items: ShoppingItem[]; tasks: Array<{ id: string; title: string }> }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const ticked = items.filter((i) => i.checked).length;

  return (
    <div className="flex flex-col gap-3">
      {items.length || tasks.length ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {items.map((i) => (
            <li key={i.id} className="flex min-h-10 items-center gap-3">
              <TaskCheck
                checked={i.checked}
                label={`Got ${i.name}`}
                onChange={(v) =>
                  start(async () => {
                    const r = await toggleShoppingItem(i.id, v);
                    if (!r.ok) notify(r.error, { tone: "error" });
                  })
                }
              />
              <span className={cn("flex-1", i.checked && "text-ink-3 line-through")}>{i.name}</span>
              {i.qty ? <span className="text-small text-ink-2">{i.qty}</span> : null}
              {i.source === "plan" ? <Chip tone="muted">plan</Chip> : null}
            </li>
          ))}
          {tasks.map((t) => (
            <li key={t.id} className="flex min-h-10 items-center gap-3">
              <TaskCheck
                checked={false}
                label={`Got ${t.title}`}
                onChange={() =>
                  start(async () => {
                    const r = await setTaskDone(t.id, true);
                    notify(r.ok ? "Ticked off" : r.error, { tone: r.ok ? "ok" : "error" });
                  })
                }
              />
              <span className="flex-1">{t.title.replace(/^(buy|get|pick up|order|grab)\s+/i, "")}</span>
              <Chip tone="muted">from Inbox</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-2">Empty. Build it from the week&apos;s plan, add items below, or capture “buy oats” from anywhere.</p>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          start(async () => {
            const r = await addShoppingItem({ name, qty: null });
            if (!r.ok) return notify(r.error, { tone: "error" });
            setName("");
          });
        }}
      >
        <label htmlFor="shop-add" className="sr-only">
          Add to shopping list
        </label>
        <input
          id="shop-add"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Add an item"
          className="h-9 flex-1 border-b border-rule bg-transparent text-small placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        {ticked ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await clearCheckedShopping();
                notify(r.ok ? `Cleared ${r.data!.removed}` : r.error, { tone: r.ok ? "ok" : "error" });
              })
            }
          >
            <X size={14} aria-hidden />
            Clear ticked
          </Button>
        ) : null}
      </form>
    </div>
  );
}

