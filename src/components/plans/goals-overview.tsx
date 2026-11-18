"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { Chip, ProgressBar } from "@/components/ui/tabs";
import type { GoalSummary } from "@/lib/data/plans";
import { keyLabel } from "@/lib/time";
import { AREA_LABEL, GoalDialog, GOAL_STATUS_LABEL, HORIZON_LABEL } from "./goal-dialog";

export function GoalsOverview({ goals }: { goals: GoalSummary[] }) {
  const [creating, setCreating] = useState(false);
  const active = goals.filter((g) => g.status === "active" || g.status === "paused");
  const closed = goals.filter((g) => g.status === "achieved" || g.status === "dropped");

  const card = (g: GoalSummary) => {
    const msDone = g.milestones.filter((m) => m.done_at).length;
    return (
      <li key={g.id}>
        <Link href={`/goals/${g.id}`} className="flex flex-col gap-3 py-4 transition-colors hover:bg-sunken/40">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-title">{g.title}</span>
            <Chip>{AREA_LABEL[g.area]}</Chip>
            {g.status !== "active" ? <Chip tone="muted">{GOAL_STATUS_LABEL[g.status]}</Chip> : null}
          </div>
          <div className="flex items-center gap-3">
            <ProgressBar value={g.progress} label={`${g.title} progress`} className="max-w-sm" />
            <span className="tnum text-small text-ink-2">{g.progress}%</span>
          </div>
          <p className="text-small text-ink-2">
            {g.target ? <>{g.target}</> : <span className="text-ink-3">No target set</span>}
            {g.deadline ? <> · by {keyLabel(g.deadline)}</> : null}
            {g.milestones.length ? <> · {msDone}/{g.milestones.length} milestones</> : null}
            {g.projects.length ? <> · {g.projects.length} project{g.projects.length === 1 ? "" : "s"}</> : null}
            {g.habits.length ? <> · {g.habits.length} habit{g.habits.length === 1 ? "" : "s"}</> : null}
          </p>
          {g.status === "active" && g.quietDays >= 14 ? (
            <p className="text-small font-medium text-danger">Nothing linked to this has moved in {g.quietDays} days.</p>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden />
          New goal
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState
          title="No goals yet"
          body="Start with the few that matter this year. Then link projects and habits to each one so Today can show whether your days move them."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Create a goal
            </Button>
          }
        />
      ) : (
        (["short", "medium", "long"] as const).map((h) => {
          const items = active.filter((g) => g.horizon === h);
          if (!items.length) return null;
          return (
            <section key={h} className="flex flex-col gap-1">
              <SectionHeader title={HORIZON_LABEL[h]} count={items.length} />
              <ul className="flex flex-col divide-y divide-rule border-y border-rule">{items.map(card)}</ul>
            </section>
          );
        })
      )}
      {closed.length ? (
        <section className="flex flex-col gap-1">
          <SectionHeader title="Closed" count={closed.length} />
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">{closed.map(card)}</ul>
        </section>
      ) : null}
      <GoalDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
