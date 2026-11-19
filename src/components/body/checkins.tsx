"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setCheckin } from "@/app/actions/body";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Checkin } from "@/lib/data/life";
import type { Profile } from "@/lib/types";

function YesNo({ label, value, onChange, size = "md" }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void; size?: "md" | "lg" }) {
  const btn = (v: boolean, text: string) => (
    <button
      type="button"
      aria-pressed={value === v}
      onClick={() => onChange(value === v ? null : v)}
      className={cn(
        "rounded-sm border font-medium transition-colors active:scale-95",
        size === "lg" ? "h-10 px-4 text-body" : "h-8 px-3 text-small",
        value === v ? (v ? "border-ink bg-ink text-canvas" : "border-ink-2 bg-sunken text-ink") : "border-rule text-ink-2 hover:border-rule-strong hover:text-ink",
      )}
    >
      {text}
    </button>
  );
  return (
    <div className="flex min-h-12 items-center gap-3">
      <span className="flex-1">{label}</span>
      <div className="flex gap-1.5" role="group" aria-label={label}>
        {btn(true, "Yes")}
        {btn(false, "No")}
      </div>
    </div>
  );
}

/** Daily food check-ins: ate well (always), protein and calories (only if switched on). */
export function FoodCheckins({ profile, today, todayKey, size }: { profile: Profile; today: Checkin | null; todayKey: string; size?: "md" | "lg" }) {
  const [ate, setAte] = useOptimistic(today?.ate_well ?? null);
  const [protein, setProtein] = useOptimistic(today?.protein_hit ?? null);
  const [cal, setCal] = useState(today?.calories != null ? String(today.calories) : "");
  const [, start] = useTransition();
  const { notify } = useToast();

  const save = (field: "ate_well" | "protein_hit" | "calories", value: boolean | number | null, optimistic?: () => void) =>
    start(async () => {
      optimistic?.();
      const r = await setCheckin({ onDate: todayKey, field, value });
      if (!r.ok) notify(r.error, { tone: "error" });
    });

  return (
    <div className="flex flex-col divide-y divide-rule border-y border-rule">
      <YesNo label="Cooked and ate well today?" value={ate} size={size} onChange={(v) => save("ate_well", v, () => setAte(v))} />
      {profile.trackers.protein ? <YesNo label="Hit your protein target?" value={protein} size={size} onChange={(v) => save("protein_hit", v, () => setProtein(v))} /> : null}
      {profile.trackers.calories ? (
        <form
          className="flex min-h-12 items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save("calories", cal === "" ? null : Math.max(0, Math.min(20000, Math.round(Number(cal)))));
            notify("Calories saved");
          }}
        >
          <label htmlFor="cal" className="flex-1">
            Calories today (rough total)
          </label>
          <input
            id="cal"
            inputMode="numeric"
            value={cal}
            onChange={(e) => setCal(e.target.value.replace(/\D/g, ""))}
            className="tnum h-8 w-24 rounded-sm border border-rule bg-surface px-2 text-right text-small focus:border-ink focus:outline-none"
          />
          <button type="submit" className="h-8 px-2 text-small font-medium">
            Save
          </button>
        </form>
      ) : null}
    </div>
  );
}
