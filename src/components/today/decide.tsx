"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setPriority, snoozeTask, triageTask } from "@/app/actions/tasks";
import { useShell } from "@/components/shell/shell-context";
import { SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { dateKey, daysBetweenKeys } from "@/lib/time";
import type { Task } from "@/lib/types";

/**
 * Resurfacing: things that have sat too long come back with a forced choice.
 * Do it today · Schedule it · Archive it · Not now (back in a week).
 */
export function Decide({ items, nowMs, tz, limit = 3 }: { items: Task[]; nowMs: number; tz: string; limit?: number }) {
  const { openTask } = useShell();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  if (!items.length) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      notify(r.ok ? ok : (r.error ?? "Something went wrong."), { tone: r.ok ? "ok" : "error" });
    });
  const age = (t: Task) => daysBetweenKeys(dateKey(t.status === "inbox" ? t.created_at : t.updated_at, tz), dateKey(nowMs, tz));
  const action = "h-7 rounded-full px-2.5 text-small text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-50";

  return (
    <section aria-labelledby="decide-title" className="flex flex-col gap-2">
      <SectionHeader
        id="decide-title"
        title="Decide"
        count={items.length}
        action={
          <Link href="/inbox" className="text-small text-ink-2 hover:text-ink">
            Inbox
          </Link>
        }
      />
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {items.slice(0, limit).map((t) => (
          <li key={t.id} className="flex flex-col gap-1 py-2.5">
            <p className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 text-micro text-ink-3">
                {t.status === "inbox" ? "captured" : "untouched"} {age(t)}d ago
              </span>
            </p>
            <div className="-ml-2.5 flex flex-wrap gap-0.5">
              <button type="button" disabled={pending} className={action} onClick={() => run(() => setPriority(t.id, true), "Added to today's three")}>
                Do today
              </button>
              <button type="button" disabled={pending} className={action} onClick={() => openTask(t)}>
                Schedule
              </button>
              <button type="button" disabled={pending} className={action} onClick={() => run(() => triageTask(t.id, "archived"), "Archived")}>
                Archive
              </button>
              <button type="button" disabled={pending} className={action} onClick={() => run(() => snoozeTask(t.id, 7), "Back in a week")}>
                Not now
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
