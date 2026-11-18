"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addGoalUpdate } from "@/app/actions/plans";
import { TaskRow } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { Chip, ProgressBar } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { frequencyLabel } from "@/lib/habits";
import { dateKey, formatShortDay, keyLabel } from "@/lib/time";
import type { Goal, GoalUpdate, Habit, Milestone, Task } from "@/lib/types";
import { AREA_LABEL, GoalDialog, GOAL_STATUS_LABEL, HORIZON_LABEL } from "./goal-dialog";
import { Milestones } from "./milestones";
import { PROJECT_STATUS_LABEL } from "./project-dialog";

export function GoalDetail({
  goal,
  milestones,
  updates,
  projects,
  habits,
  tasks,
  tz,
  nowMs,
}: {
  goal: Goal;
  milestones: Milestone[];
  updates: GoalUpdate[];
  projects: Array<{ id: string; title: string; status: string }>;
  habits: Habit[];
  tasks: Task[];
  tz: string;
  nowMs: number;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [progress, setProgress] = useState(goal.progress);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const todayKey = dateKey(nowMs, tz);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/goals" className="inline-flex items-center gap-1.5 text-small text-ink-2 hover:text-ink">
          <ArrowLeft size={14} aria-hidden />
          Goals
        </Link>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-h1 font-normal tracking-[-0.02em]">{goal.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-small text-ink-2">
              <Chip>{AREA_LABEL[goal.area]}</Chip>
              <span>{HORIZON_LABEL[goal.horizon]}</span>
              {goal.deadline ? <span>· by {keyLabel(goal.deadline, { day: "numeric", month: "long", year: "numeric" })}</span> : null}
              {goal.status !== "active" ? <Chip tone="muted">{GOAL_STATUS_LABEL[goal.status]}</Chip> : null}
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        {goal.target ? (
          <p className="mt-4 text-lead">
            <span className="text-ink-2">Done looks like: </span>
            {goal.target}
          </p>
        ) : null}
        {goal.description ? <p className="mt-2 max-w-[62ch] text-body text-ink-2">{goal.description}</p> : null}
        <div className="mt-6 flex max-w-md items-center gap-3">
          <ProgressBar value={goal.progress} label="Goal progress" />
          <span className="tnum shrink-0 text-small text-ink-2">{goal.progress}%</span>
        </div>
      </div>

      <Milestones items={milestones} goalId={goal.id} todayKey={todayKey} />

      <section className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <SectionHeader title="Projects" count={projects.length || undefined} />
          {projects.length ? (
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-ink">
                    <span>{p.title}</span>
                    <span className="text-small text-ink-2">{PROJECT_STATUS_LABEL[p.status as keyof typeof PROJECT_STATUS_LABEL]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-2">Link a project to this goal from the project&apos;s Edit dialog.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <SectionHeader title="Habits" count={habits.length || undefined} />
          {habits.length ? (
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {habits.map((h) => (
                <li key={h.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <span>{h.title}</span>
                  <span className="text-small text-ink-2">{frequencyLabel(h)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-2">Link a habit to this goal in Habits.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Next steps from linked projects" count={tasks.length || undefined} />
        {tasks.length ? (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {tasks.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} nowMs={nowMs} tz={tz} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No actionable steps yet" body="Steps live in projects. Link a project and give it a concrete next task." />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Status updates" count={updates.length || undefined} />
        <form
          className="flex flex-col gap-3 rounded-md border border-rule bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addGoalUpdate({ goalId: goal.id, body, progress: progress !== goal.progress ? progress : null });
              if (!r.ok) return notify(r.error, { tone: "error" });
              setBody("");
              notify("Update added");
            });
          }}
        >
          <label htmlFor="goal-update" className="sr-only">
            How is it going?
          </label>
          <textarea
            id="goal-update"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="How is it going? What changed?"
            className="min-h-20 w-full resize-y bg-transparent text-body placeholder:text-ink-3 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-3">
            <label htmlFor="goal-progress" className="text-small text-ink-2">
              Progress
            </label>
            <input
              id="goal-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-40 accent-[var(--ink)]"
            />
            <span className="tnum w-10 text-small">{progress}%</span>
            <Button type="submit" size="sm" variant="primary" className="ml-auto" pending={pending} disabled={!body.trim()}>
              Add update
            </Button>
          </div>
        </form>
        {updates.length ? (
          <ol className="flex flex-col gap-4">
            {updates.map((u) => (
              <li key={u.id} className="grid grid-cols-[88px_1fr] gap-4 text-body">
                <span className="text-small text-ink-2">{formatShortDay(u.created_at, tz)}</span>
                <div>
                  <p className="whitespace-pre-wrap">{u.body}</p>
                  {u.progress !== null ? <p className="mt-1 text-small text-ink-2">Progress set to {u.progress}%</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <GoalDialog open={editing} onClose={() => setEditing(false)} goal={goal} />
    </div>
  );
}
