"use client";

import { BedDouble, Dumbbell, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getLogSheetData } from "@/app/actions/plans";
import { HabitLogButtons } from "@/components/plans/habit-controls";
import { Dialog } from "@/components/ui/dialog";
import { Planned, Skeleton } from "@/components/ui/misc";
import { habitStats, isScheduled } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/types";

const LATER = [
  { icon: Dumbbell, label: "Gym session detail", phase: "Phase 5" },
  { icon: Utensils, label: "Cooked and ate well", phase: "Phase 5" },
  { icon: BedDouble, label: "Bedtime / wake time", phase: "Phase 5" },
];

/** One-tap logging. Open, tap, close. */
export function LogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Quick log" description="One tap, then close the app.">
      {open ? <LogBody onClose={onClose} /> : null}
    </Dialog>
  );
}

function LogBody({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ habits: Habit[]; logs: HabitLog[]; todayKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getLogSheetData().then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data!);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, []);

  const due = data?.habits.filter((h) => isScheduled(h, data.todayKey)) ?? [];

  return (
    <div className="flex flex-col gap-5">
      {error ? <p className="text-small text-danger">{error}</p> : null}
      {!data && !error ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : null}
      {data && !due.length ? (
        <p className="text-small text-ink-2">
          No habits to log today.{" "}
          <Link href="/habits" onClick={onClose} className="underline underline-offset-4">
            Set some up
          </Link>
          .
        </p>
      ) : null}
      {due.length ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {due.map((h) => {
            const s = habitStats(h, data!.logs, data!.todayKey);
            return (
              <li key={h.id} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.title}</span>
                  <span className="text-micro text-ink-2">
                    {s.weekTarget ? `${s.weekDone}/${s.weekTarget} this week` : s.streak ? `${s.streak}-day streak` : h.kind === "check_in" ? "Honest yes/no" : ""}
                  </span>
                </span>
                <HabitLogButtons habit={h} dateKey={data!.todayKey} status={s.todayLog?.status ?? null} size="lg" />
              </li>
            );
          })}
        </ul>
      ) : null}
      <ul className="flex flex-col gap-2">
        {LATER.map(({ icon: Icon, label, phase }) => (
          <li key={label} className="flex items-center gap-3 text-small text-ink-2">
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            <span className="flex-1">{label}</span>
            <Planned phase={phase} />
          </li>
        ))}
      </ul>
      <p className="text-small text-ink-3">Check-ins are self-report. LifeOS can&apos;t see or block other apps on your phone.</p>
    </div>
  );
}
