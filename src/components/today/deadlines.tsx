"use client";

import { Plus } from "lucide-react";
import { useTransition } from "react";
import { setPriority } from "@/app/actions/tasks";
import { IconButton } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { TaskRow } from "@/components/tasks/task-row";
import { describeDue } from "@/lib/time";
import type { Task } from "@/lib/types";

/** Overdue first, then the next seven days. Labels are direct: "due in 3 days". */
export function Deadlines({ deadlines, nowMs, tz, todayKey }: { deadlines: Task[]; nowMs: number; tz: string; todayKey: string }) {
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const overdue = deadlines.filter((t) => describeDue(t.due_at!, t.due_has_time, nowMs, tz).overdue);
  const upcoming = deadlines.filter((t) => !overdue.includes(t));

  const promote = (t: Task) =>
    start(async () => {
      const res = await setPriority(t.id, true);
      notify(res.ok ? "Added to today's three" : res.error, { tone: res.ok ? "ok" : "error" });
    });

  const row = (t: Task) => (
    <li key={t.id}>
      <TaskRow
        task={t}
        nowMs={nowMs}
        tz={tz}
        trailing={
          t.today_date === todayKey ? null : (
            <IconButton
              label={`Add “${t.title}” to today's three`}
              size="sm"
              disabled={pending}
              onClick={() => promote(t)}
              className="lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
            >
              <Plus size={14} aria-hidden />
            </IconButton>
          )
        }
      />
    </li>
  );

  return (
    <section aria-labelledby="deadlines-title" className="flex flex-col gap-2">
      <SectionHeader
        id="deadlines-title"
        title="Deadlines"
        count={overdue.length ? `${overdue.length} overdue` : deadlines.length ? "next 7 days" : undefined}
      />
      {deadlines.length === 0 ? (
        <EmptyState
          title="No deadlines in the next 7 days"
          body={
            <>
              Capture one in plain words, like <span className="text-ink">“essay due 12 Dec 9am”</span>.
            </>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {overdue.map(row)}
          {upcoming.map(row)}
        </ul>
      )}
    </section>
  );
}
