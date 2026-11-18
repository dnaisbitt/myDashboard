"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { useShell } from "@/components/shell/shell-context";
import { describeDue } from "@/lib/time";
import type { Task } from "@/lib/types";
import { TaskRow } from "./task-row";

export function TaskList({ open, recentlyDone, nowMs, tz }: { open: Task[]; recentlyDone: Task[]; nowMs: number; tz: string }) {
  const { openCapture } = useShell();
  const overdue: Task[] = [];
  const dated: Task[] = [];
  const undated: Task[] = [];
  for (const t of open) {
    if (!t.due_at) undated.push(t);
    else if (describeDue(t.due_at, t.due_has_time, nowMs, tz).overdue) overdue.push(t);
    else dated.push(t);
  }

  if (!open.length && !recentlyDone.length) {
    return (
      <EmptyState
        title="No tasks yet"
        body="Capture one line and it becomes a task. Dates are picked up automatically."
        action={
          <Button size="sm" onClick={() => openCapture()}>
            <Plus size={14} aria-hidden />
            Capture a task
          </Button>
        }
      />
    );
  }

  const group = (title: string, items: Task[]) =>
    items.length ? (
      <section className="flex flex-col gap-1" aria-label={title}>
        <SectionHeader title={title} count={items.length} />
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {items.map((t) => (
            <li key={t.id}>
              <TaskRow task={t} nowMs={nowMs} tz={tz} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-10">
      {group("Overdue", overdue)}
      {group("Upcoming", dated)}
      {group("No date", undated)}
      {group("Recently completed", recentlyDone)}
    </div>
  );
}
