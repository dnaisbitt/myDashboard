"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { setTaskDone } from "@/app/actions/tasks";
import { TaskCheck } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { useShell } from "@/components/shell/shell-context";
import { cn } from "@/lib/cn";
import { describeDue, keyLabel } from "@/lib/time";
import type { Task } from "@/lib/types";

/** One task line: check, title (opens editor), due label, optional trailing actions. */
export function TaskRow({
  task,
  nowMs,
  tz,
  leading,
  trailing,
  meta,
  className,
}: {
  task: Task;
  nowMs: number;
  tz: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Small second line under the title (project, category, checklist…). */
  meta?: ReactNode;
  className?: string;
}) {
  const { openTask } = useShell();
  const { notify } = useToast();
  const [, start] = useTransition();
  const [done, setDoneOptimistic] = useOptimistic(task.status === "done");
  const due = task.due_at ? describeDue(task.due_at, task.due_has_time, nowMs, tz) : null;
  const overdue = Boolean(due?.overdue) && !done;

  function toggle(next: boolean) {
    start(async () => {
      setDoneOptimistic(next);
      const res = await setTaskDone(task.id, next);
      if (!res.ok) {
        notify(res.error, { tone: "error" });
        return;
      }
      if (next && res.data?.nextDue) {
        notify(`Done. Next one is due ${keyLabel(res.data.nextDue)}`);
      } else if (next) {
        notify("Done", {
          action: {
            label: "Undo",
            run: () => start(async () => void (await setTaskDone(task.id, false))),
          },
        });
      }
    });
  }

  return (
    <div className={cn("group flex min-h-11 items-center gap-3 py-1.5", className)}>
      {leading}
      <TaskCheck checked={done} onChange={toggle} label={`Complete “${task.title}”`} tone={overdue ? "danger" : "default"} />
      <button
        type="button"
        onClick={() => openTask(task)}
        className="min-w-0 flex-1 rounded-[4px] text-left focus-visible:outline-offset-4"
      >
        <span
          className={cn(
            "block truncate transition-colors duration-200",
            done ? "text-ink-3 line-through decoration-ink-3/60" : "text-ink",
          )}
        >
          {task.title}
        </span>
        {meta ? <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro text-ink-2">{meta}</span> : null}
      </button>
      {due && !done ? (
        <span
          className={cn(
            "shrink-0 text-small whitespace-nowrap",
            overdue ? "font-medium text-danger" : due.daysAway <= 2 ? "text-ink" : "text-ink-2",
          )}
        >
          {due.label}
        </span>
      ) : null}
      {trailing}
    </div>
  );
}
