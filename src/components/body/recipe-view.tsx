"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Chip } from "@/components/ui/tabs";
import { RECIPE_STATUS_LABEL, type Recipe } from "@/lib/meals";

/** Method text → steps: one per line, with any existing "1." / "-" numbering stripped. */
function steps(method: string | null) {
  return (method ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}

/** Read-only recipe: ingredients and numbered method, in one tap. */
export function RecipeView({ recipe, onClose, onEdit }: { recipe: Recipe | null; onClose: () => void; onEdit?: (r: Recipe) => void }) {
  const method = steps(recipe?.method ?? null);
  return (
    <Dialog open={Boolean(recipe)} onClose={onClose} title={recipe?.title ?? "Recipe"} className="sm:w-[min(94vw,680px)]">
      {recipe ? (
        <div className="flex flex-col gap-6">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
            <Chip>{RECIPE_STATUS_LABEL[recipe.status]}</Chip>
            <span>
              {recipe.portions} portion{recipe.portions === 1 ? "" : "s"}
            </span>
            {recipe.minutes ? <span>· {recipe.minutes} min</span> : null}
            {recipe.protein_g ? <span>· {recipe.protein_g}g protein</span> : null}
          </p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-label="Ingredients">
              <h3 className="mb-2 text-small font-semibold">Ingredients</h3>
              {recipe.ingredients.length ? (
                <ul className="flex flex-col divide-y divide-rule border-y border-rule">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-baseline gap-3 py-2 text-body">
                      <span className="flex-1">{ing.name}</span>
                      {ing.qty || ing.unit ? (
                        <span className="shrink-0 text-ink-2">
                          {ing.qty}
                          {ing.unit ? ` ${ing.unit}` : ""}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-3">None added.</p>
              )}
            </section>
            <section aria-label="Method">
              <h3 className="mb-2 text-small font-semibold">Method</h3>
              {method.length ? (
                <ol className="flex flex-col gap-3">
                  {method.map((s, i) => (
                    <li key={i} className="grid grid-cols-[24px_1fr] gap-2 text-body leading-relaxed">
                      <span className="font-display text-title leading-none text-ink-3">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-small text-ink-3">None added.</p>
              )}
            </section>
          </div>
          {onEdit ? (
            <div className="flex justify-end border-t border-rule pt-4">
              <Button size="sm" onClick={() => onEdit(recipe)}>
                <Pencil size={14} aria-hidden />
                Edit
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
