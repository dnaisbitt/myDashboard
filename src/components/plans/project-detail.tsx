"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveProjectNotes } from "@/app/actions/plans";
import { createTask } from "@/app/actions/tasks";
import { TaskRow } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { Chip, ProgressBar } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateKey, keyLabel } from "@/lib/time";
import type { Milestone, Project, Task } from "@/lib/types";
import { Milestones } from "./milestones";
import { ProjectDialog, PROJECT_STATUS_LABEL } from "./project-dialog";

export function ProjectDetail({
  project,
  tasks,
  milestones,
  goals,
  tz,
  nowMs,
}: {
  project: Project;
  tasks: Task[];
  milestones: Milestone[];
  goals: Array<{ id: string; title: string }>;
  tz: string;
  nowMs: number;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [newTask, setNewTask] = useState("");
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const total = tasks.length;
  const goal = goals.find((g) => g.id === project.goal_id);
  const todayKey = dateKey(nowMs, tz);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-small text-ink-2 hover:text-ink">
          <ArrowLeft size={14} aria-hidden />
          Projects
        </Link>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-h1 font-normal tracking-[-0.02em]">{project.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-small text-ink-2">
              <Chip>{PROJECT_STATUS_LABEL[project.status]}</Chip>
              {project.deadline ? <span>Due {keyLabel(project.deadline, { weekday: "short", day: "numeric", month: "long" })}</span> : null}
              {goal ? (
                <Link href={`/goals/${goal.id}`} className="underline decoration-rule-strong underline-offset-4 hover:text-ink">
                  Moves: {goal.title}
                </Link>
              ) : null}
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        {project.description ? <p className="mt-4 max-w-[62ch] text-body text-ink-2">{project.description}</p> : null}
        <div className="mt-6 flex max-w-md items-center gap-3">
          <ProgressBar value={total ? (done.length / total) * 100 : 0} label="Project progress" />
          <span className="tnum shrink-0 text-small text-ink-2">
            {done.length}/{total} tasks
          </span>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Next steps" count={open.length} />
        {open.length ? (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {open.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} nowMs={nowMs} tz={tz} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No next step" body="A project without a next step stalls. Add one concrete thing you could do in under an hour." />
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTask.trim()) return;
            start(async () => {
              const r = await createTask({ title: newTask, projectId: project.id });
              if (!r.ok) return notify(r.error, { tone: "error" });
              setNewTask("");
            });
          }}
        >
          <label htmlFor="project-task" className="sr-only">
            Add a task to this project
          </label>
          <input
            id="project-task"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            maxLength={300}
            placeholder="Add a concrete step"
            className="h-10 flex-1 border-b border-rule bg-transparent text-body placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
          <Button type="submit" size="sm" pending={pending} disabled={!newTask.trim()}>
            Add
          </Button>
        </form>
      </section>

      <Milestones items={milestones} projectId={project.id} todayKey={todayKey} />

      <section className="flex flex-col gap-2">
        <SectionHeader title="Notes" />
        <textarea
          aria-label="Project notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes === (project.notes ?? "")) return;
            start(async () => {
              const r = await saveProjectNotes(project.id, notes);
              notify(r.ok ? "Notes saved" : r.error, { tone: r.ok ? "ok" : "error" });
            });
          }}
          maxLength={20000}
          placeholder="Notes · saves when you click away"
          className="min-h-40 w-full rounded-md border border-rule bg-surface p-3 text-body leading-relaxed placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
      </section>

      {done.length ? (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Done" count={done.length} />
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {done.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} nowMs={nowMs} tz={tz} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ProjectDialog open={editing} onClose={() => setEditing(false)} project={project} goals={goals} />
    </div>
  );
}
