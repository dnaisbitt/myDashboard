"use client";

import { ArrowUp, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { captureTask, carryOverPriorities, dismissCarryOver, movePriority, setPriority } from "@/app/actions/tasks";
import { Button, IconButton } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { TaskRow } from "@/components/tasks/task-row";
import { dueToIso, parseCapture } from "@/lib/capture/parse";
import { cn } from "@/lib/cn";
import { describeDue } from "@/lib/time";
import type { Task } from "@/lib/types";

export function Priorities({
  priorities,
  carryOver,
  candidates,
  nowMs,
  tz,
  marked,
}: {
  priorities: Task[];
  carryOver: Task[];
  candidates: Task[];
  nowMs: number;
  tz: string;
  /** Whether the highlighter belongs to priority #1 (when nothing is scheduled). */
  marked: boolean;
}) {
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const byRank = new Map(priorities.map((t) => [t.today_rank, t]));
  const free = 3 - priorities.length;
  const done = priorities.filter((t) => t.status === "done").length;
  const firstEmpty = ([1, 2, 3] as const).find((r) => !byRank.has(r));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) notify(res.error ?? "Something went wrong.", { tone: "error" });
      else if (success) notify(success);
    });

  return (
    <section aria-labelledby="priorities-title" className="flex flex-col gap-2">
      <SectionHeader
        id="priorities-title"
        title="Today's three"
        count={priorities.length ? `${done}/${priorities.length}` : undefined}
      />

      {carryOver.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-sunken/70 px-3.5 py-2.5 text-small">
          <p className="flex-1">
            <span className="font-medium">
              {carryOver.length} unfinished from before:
            </span>{" "}
            <span className="text-ink-2">{carryOver.map((t) => t.title).join(", ")}</span>
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => dismissCarryOver(carryOver.map((t) => t.id)), "Kept as tasks, off today")}
            >
              Let go
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || free === 0}
              onClick={() => run(() => carryOverPriorities(carryOver.map((t) => t.id)), "Carried over")}
            >
              Carry over
            </Button>
          </div>
        </div>
      ) : null}

      <ol className="flex flex-col divide-y divide-rule border-y border-rule">
        {([1, 2, 3] as const).map((rank) => {
          const task = byRank.get(rank);
          const numeral = (
            <span
              aria-hidden
              className={cn(
                "relative w-5 shrink-0 font-display text-title leading-none",
                task?.status === "done" ? "text-ink-3" : "text-ink-2",
              )}
            >
              {marked && rank === 1 && task && task.status !== "done" ? (
                <span className="absolute -inset-x-1 inset-y-0.5 -z-10 origin-left animate-sweep rounded-[3px] bg-mark" />
              ) : null}
              <span className={cn(marked && rank === 1 && task && task.status !== "done" && "text-mark-ink")}>{rank}</span>
            </span>
          );
          if (task) {
            return (
              <li key={rank} className="relative isolate">
                <TaskRow
                  task={task}
                  nowMs={nowMs}
                  tz={tz}
                  leading={numeral}
                  trailing={
                    <span className="flex shrink-0 items-center opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                      {rank > 1 ? (
                        <IconButton label="Move up" size="sm" disabled={pending} onClick={() => run(() => movePriority(task.id, "up"))}>
                          <ArrowUp size={14} aria-hidden />
                        </IconButton>
                      ) : null}
                      <IconButton
                        label="Remove from today's three"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => setPriority(task.id, false), "Removed from today. Still in your tasks.")}
                      >
                        <X size={14} aria-hidden />
                      </IconButton>
                    </span>
                  }
                />
              </li>
            );
          }
          return (
            <li key={rank} className="flex min-h-11 items-center gap-3 py-1.5">
              <span aria-hidden className="w-5 shrink-0 font-display text-title leading-none text-ink-3/60">
                {rank}
              </span>
              {rank === firstEmpty ? <InlineAdd tz={tz} /> : <span className="text-small text-ink-3">—</span>}
            </li>
          );
        })}
      </ol>

      {free > 0 && candidates.length ? (
        <div className="mt-2">
          <p className="mb-1 text-small text-ink-2">Or pick from your list</p>
          <ul className="flex flex-col">
            {candidates.slice(0, 4).map((t) => (
              <li key={t.id} className="flex min-h-9 items-center gap-3 text-small">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.due_at ? (
                  <span className="text-ink-2">{describeDue(t.due_at, t.due_has_time, nowMs, tz).label}</span>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={pending}
                  onClick={() => run(() => setPriority(t.id, true), "Added to today's three")}
                  aria-label={`Add “${t.title}” to today's three`}
                >
                  <Plus size={14} aria-hidden />
                  Today
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function InlineAdd({ tz }: { tz: string }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const { notify } = useToast();

  return (
    <form
      className="flex flex-1 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseCapture(value, new Date(), tz);
        if (!parsed.title) return;
        start(async () => {
          const res = await captureTask({
            title: parsed.title,
            raw: value,
            dueAt: parsed.due ? dueToIso(parsed.due, tz) : null,
            dueHasTime: Boolean(parsed.due?.time),
            asPriority: true,
          });
          if (!res.ok) notify(res.error, { tone: "error" });
          else setValue("");
        });
      }}
    >
      <label htmlFor="priority-add" className="sr-only">
        Add a priority for today
      </label>
      <input
        id="priority-add"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={300}
        autoComplete="off"
        placeholder="The most important thing today…"
        className="h-9 min-w-0 flex-1 bg-transparent text-body placeholder:text-ink-3 focus:outline-none"
      />
      {value.trim() ? (
        <Button type="submit" size="sm" variant="secondary" pending={pending}>
          Add
        </Button>
      ) : null}
    </form>
  );
}
