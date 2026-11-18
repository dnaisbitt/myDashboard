"use client";

import { useTransition } from "react";
import { setPriority, triageTask } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useShell } from "@/components/shell/shell-context";
import { daysBetweenKeys, dateKey } from "@/lib/time";
import type { Task } from "@/lib/types";
import { TaskRow } from "./task-row";

function age(createdAt: string, nowMs: number, tz: string) {
  const d = daysBetweenKeys(dateKey(createdAt, tz), dateKey(nowMs, tz));
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

/** Every item asks for a decision: do it today, schedule it, keep it, or let it go. */
export function InboxList({ tasks, nowMs, tz }: { tasks: Task[]; nowMs: number; tz: string }) {
  const { notify, } = useToast();
  const { openTask, openCapture } = useShell();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const res = await fn();
      notify(res.ok ? success : (res.error ?? "Something went wrong."), { tone: res.ok ? "ok" : "error" });
    });

  if (!tasks.length) {
    return (
      <EmptyState
        title="Inbox zero"
        body="Anything you capture without a date lands here until you decide what it is."
        action={
          <Button size="sm" onClick={() => openCapture()}>
            Capture something
          </Button>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-rule border-y border-rule">
      {tasks.map((t) => (
        <li key={t.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <TaskRow task={t} nowMs={nowMs} tz={tz} className="py-0" />
            <p className="pl-[30px] text-micro text-ink-3">Captured {age(t.created_at, nowMs, tz)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1 pl-[22px] sm:pl-0">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setPriority(t.id, true), "Added to today's three")}>
              Do today
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => openTask(t)}>
              Schedule
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => triageTask(t.id, "open"), "Moved to Tasks")}>
              Keep
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => triageTask(t.id, "archived"), "Archived")}>
              Archive
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
