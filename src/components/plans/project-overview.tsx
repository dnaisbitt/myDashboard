"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { Chip, ProgressBar } from "@/components/ui/tabs";
import type { ProjectSummary } from "@/lib/data/plans";
import { cn } from "@/lib/cn";
import { keyLabel } from "@/lib/time";
import { ProjectDialog, PROJECT_STATUS_LABEL } from "./project-dialog";

const GROUPS: Array<{ key: ProjectSummary["health"]; title: string }> = [
  { key: "delayed", title: "Delayed" },
  { key: "attention", title: "Needs attention" },
  { key: "progressing", title: "Progressing" },
  { key: "idle", title: "Paused" },
  { key: "closed", title: "Finished" },
];

/** One view of every project, grouped by what it needs from you. */
export function ProjectOverview({ projects, goals }: { projects: ProjectSummary[]; goals: Array<{ id: string; title: string }> }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden />
          New project
        </Button>
      </div>
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body="A project is anything with several steps: coursework, the side hustle, a trip. The side hustle can start as “Exploring” while you collect and test ideas."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Create a project
            </Button>
          }
        />
      ) : (
        GROUPS.map((g) => {
          const items = projects.filter((p) => p.health === g.key);
          if (!items.length) return null;
          return (
            <section key={g.key} className="flex flex-col gap-2">
              <SectionHeader title={g.title} count={items.length} />
              <ul className="flex flex-col divide-y divide-rule border-y border-rule">
                {items.map((p) => {
                  const total = p.open + p.done;
                  return (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="grid gap-2 py-3.5 transition-colors hover:bg-sunken/40 sm:grid-cols-[1fr_180px] sm:items-center sm:gap-6">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">{p.title}</span>
                            {p.status === "exploring" ? <Chip>Exploring</Chip> : null}
                            {p.priority === 1 ? <Chip>High</Chip> : null}
                          </div>
                          <p className="mt-0.5 text-small text-ink-2">
                            <span className={cn(g.key === "delayed" && "text-danger", g.key === "attention" && "text-ink")}>{p.healthReason}</span>
                            {p.goalTitle ? <> · {p.goalTitle}</> : null}
                            {p.deadline ? <> · due {keyLabel(p.deadline)}</> : null}
                            {g.key === "closed" ? <> · {PROJECT_STATUS_LABEL[p.status]}</> : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <ProgressBar value={total ? (p.done / total) * 100 : 0} label={`${p.title} progress`} />
                          <span className="tnum w-12 shrink-0 text-right text-small text-ink-2">
                            {p.done}/{total}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      <ProjectDialog open={creating} onClose={() => setCreating(false)} goals={goals} />
    </div>
  );
}
