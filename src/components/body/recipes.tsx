"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteRecipe, saveRecipe } from "@/app/actions/food";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { Chip, ViewTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { RECIPE_STATUS_LABEL, type Ingredient, type Recipe } from "@/lib/meals";

type Filter = "all" | Recipe["status"] | "quick";

export function Recipes({ recipes }: { recipes: Recipe[] }) {
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const shown = recipes.filter((r) => (filter === "all" ? true : filter === "quick" ? (r.minutes ?? 99) <= 20 : r.status === filter));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <ViewTabs
          label="Recipe filter"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "All", count: recipes.length },
            { value: "staple", label: "Staples", count: recipes.filter((r) => r.status === "staple").length },
            { value: "want_to_try", label: "Want to try", count: recipes.filter((r) => r.status === "want_to_try").length },
            { value: "cooked", label: "Cooked it", count: recipes.filter((r) => r.status === "cooked").length },
            { value: "quick", label: "Quick (≤20 min)" },
          ]}
        />
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditing("new")}>
          <Plus size={14} aria-hidden />
          New recipe
        </Button>
      </div>
      {!recipes.length ? (
        <EmptyState
          title="Your recipe library is empty"
          body="Add your two staples (lean mince bolognese with pasta, and the gnocchi) and anything you want to try. Ingredients feed the shopping list."
          action={
            <Button size="sm" onClick={() => setEditing("new")}>
              Add a recipe
            </Button>
          }
        />
      ) : shown.length ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setEditing(r)} className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left hover:bg-sunken/40">
                <span className="min-w-0 flex-1 font-medium">{r.title}</span>
                <Chip>{RECIPE_STATUS_LABEL[r.status]}</Chip>
                <span className="text-small text-ink-2">
                  {r.portions} portion{r.portions === 1 ? "" : "s"}
                  {r.minutes ? ` · ${r.minutes} min` : ""}
                  {r.protein_g ? ` · ${r.protein_g}g protein` : ""}
                  {r.ingredients.length ? ` · ${r.ingredients.length} ingredients` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-2">Nothing in this filter.</p>
      )}
      <RecipeDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function RecipeDialog({ value, onClose }: { value: Recipe | "new" | null; onClose: () => void }) {
  const r = value && value !== "new" ? value : undefined;
  return (
    <Dialog open={value !== null} onClose={onClose} title={r ? "Recipe" : "New recipe"}>
      {value !== null ? <RecipeForm key={r?.id ?? "new"} recipe={r} onClose={onClose} /> : null}
    </Dialog>
  );
}

function RecipeForm({ recipe, onClose }: { recipe?: Recipe; onClose: () => void }) {
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [status, setStatus] = useState<Recipe["status"]>(recipe?.status ?? "want_to_try");
  const [portions, setPortions] = useState(recipe?.portions ?? 2);
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : "");
  const [protein, setProtein] = useState(recipe?.protein_g ? String(recipe.protein_g) : "");
  const [ings, setIngs] = useState<Ingredient[]>(recipe?.ingredients.length ? recipe.ingredients : [{ name: "", qty: "", unit: "" }]);
  const [method, setMethod] = useState(recipe?.method ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const setIng = (i: number, patch: Partial<Ingredient>) => setIngs(ings.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveRecipe({
            id: recipe?.id,
            title,
            status,
            portions,
            minutes: minutes ? Number(minutes) : null,
            proteinG: protein ? Number(protein) : null,
            ingredients: ings.filter((i) => i.name.trim()),
            method: method || null,
          });
          if (!r.ok) return setError(r.error);
          notify("Recipe saved");
          onClose();
        });
      }}
    >
      <Field label="Name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus placeholder="Lean mince bolognese" />}</Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Status">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as Recipe["status"])}>
              {Object.entries(RECIPE_STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Portions" hint={portions >= 2 ? "Leftovers → lunch" : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} type="number" min={1} max={12} value={portions} onChange={(e) => setPortions(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />}
        </Field>
        <Field label="Minutes">{(id) => <Input id={id} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />}</Field>
        <Field label="Protein (g)">{(id) => <Input id={id} inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value.replace(/\D/g, ""))} placeholder="whole batch" />}</Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-small font-medium">Ingredients (whole batch)</legend>
        {ings.map((ing, i) => (
          <div key={i} className="grid grid-cols-[1fr_72px_72px_28px] gap-2">
            <input aria-label="Ingredient" value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} maxLength={80} placeholder="Lean mince" className="h-9 rounded-sm border border-rule bg-surface px-2 text-small focus:border-ink focus:outline-none" />
            <input aria-label="Quantity" value={ing.qty} onChange={(e) => setIng(i, { qty: e.target.value })} maxLength={20} placeholder="500" className="h-9 rounded-sm border border-rule bg-surface px-2 text-small focus:border-ink focus:outline-none" />
            <input aria-label="Unit" value={ing.unit} onChange={(e) => setIng(i, { unit: e.target.value })} maxLength={20} placeholder="g" className="h-9 rounded-sm border border-rule bg-surface px-2 text-small focus:border-ink focus:outline-none" />
            <IconButton label="Remove ingredient" size="sm" className="self-center" onClick={() => setIngs(ings.length > 1 ? ings.filter((_, j) => j !== i) : [{ name: "", qty: "", unit: "" }])}>
              <X size={13} aria-hidden />
            </IconButton>
          </div>
        ))}
        <button type="button" onClick={() => setIngs([...ings, { name: "", qty: "", unit: "" }])} className="self-start text-small text-ink-2 underline underline-offset-4 hover:text-ink">
          Add ingredient
        </button>
      </fieldset>
      <Field label="Method">{(id) => <Textarea id={id} value={method} onChange={(e) => setMethod(e.target.value)} maxLength={10000} placeholder="Short steps" />}</Field>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {recipe ? (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          Save
        </Button>
      </div>
      {recipe ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title={`Delete “${recipe.title}”?`}
          body="It will also be removed from any planned dinners."
          onConfirm={() =>
            start(async () => {
              const r = await deleteRecipe(recipe.id);
              setConfirming(false);
              if (!r.ok) return setError(r.error);
              notify("Recipe deleted");
              onClose();
            })
          }
        />
      ) : null}
    </form>
  );
}

