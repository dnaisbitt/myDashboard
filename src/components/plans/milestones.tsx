"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { addMilestone, deleteMilestone, toggleMilestone } from "@/app/actions/plans";
import { IconButton } from "@/components/ui/button";
import { TaskCheck } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { keyLabel } from "@/lib/time";
import type { Milestone } from "@/lib/types";

export function Milestones({
  items,
  goalId = null,
  projectId = null,
  todayKey,
}: {
  items: Milestone[];
  goalId?: string | null;
  projectId?: string | null;
  todayKey: string;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const done = items.filter((m) => m.done_at).length;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) notify(r.error ?? "Something went wrong.", { tone: "error" });
      else after?.();
    });

  return (
    <section className="flex flex-col gap-2" aria-label="Milestones">
      <SectionHeader title="Milestones" count={items.length ? `${done}/${items.length}` : undefined} />
      {items.length ? (
        <ol className="flex flex-col divide-y divide-rule border-y border-rule">
          {items.map((m) => {
            const late = !m.done_at && m.due_on && m.due_on < todayKey;
            return (
              <li key={m.id} className="group flex min-h-11 items-center gap-3 py-1.5">
                <TaskCheck checked={Boolean(m.done_at)} label={`Milestone “${m.title}” reached`} onChange={(v) => run(() => toggleMilestone(m.id, v))} />
                <span className={cn("flex-1", m.done_at && "text-ink-3 line-through")}>{m.title}</span>
                {m.due_on ? <span className={cn("text-small", late ? "font-medium text-danger" : "text-ink-2")}>{keyLabel(m.due_on)}</span> : null}
                <IconButton label={`Delete milestone “${m.title}”`} size="sm" className="lg:opacity-0 lg:group-hover:opacity-100" onClick={() => run(() => deleteMilestone(m.id))}>
                  <X size={13} aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ol>
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run(() => addMilestone({ goalId, projectId, title, dueOn: due || null }), () => {
            setTitle("");
            setDue("");
          });
        }}
      >
        <label className="sr-only" htmlFor={`ms-${goalId ?? projectId}`}>
          New milestone
        </label>
        <input
          id={`ms-${goalId ?? projectId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Add a milestone"
          className="h-9 min-w-40 flex-1 border-b border-rule bg-transparent text-small placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <input
          type="date"
          aria-label="Milestone date (optional)"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-9 border-b border-rule bg-transparent text-small text-ink-2 focus:border-ink focus:outline-none"
        />
        <button type="submit" disabled={pending || !title.trim()} className="h-9 px-2 text-small font-medium disabled:text-ink-3">
          Add
        </button>
      </form>
    </section>
  );
}
