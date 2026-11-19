"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLogSheetData } from "@/app/actions/plans";
import { FoodCheckins } from "@/components/body/checkins";
import { QuickSleep } from "@/components/body/sleep";
import { WorkoutButtons } from "@/components/body/training";
import { QuickSpend } from "@/components/money/quick-spend";
import { HabitLogButtons } from "@/components/plans/habit-controls";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { habitStats, isScheduled } from "@/lib/habits";

type Data = Extract<Awaited<ReturnType<typeof getLogSheetData>>, { ok: true }>["data"];

/** One-tap logging. Open, tap, close. */
export function LogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Quick log" description="One tap, then close the app.">
      {open ? <LogBody onClose={onClose} /> : null}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-small font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function LogBody({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
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

  if (error) return <p className="text-small text-danger">{error}</p>;
  if (!data)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );

  const due = data.habits.filter((h) => isScheduled(h, data.todayKey));

  return (
    <div className="flex flex-col gap-4">
      <Section title="Spent something">
        <QuickSpend todayKey={data.todayKey} recentCategories={data.categories} compact />
      </Section>
      <Section title="Gym">
        <WorkoutButtons todayKey={data.todayKey} current={data.workout} size="lg" />
      </Section>
      <Section title="Food">
        <FoodCheckins profile={data.profile} today={data.checkin} todayKey={data.todayKey} size="lg" />
      </Section>
      <Section title="Sleep">
        <QuickSleep large />
      </Section>
      {due.length ? (
        <Section title="Habits">
          <ul className="flex flex-col divide-y divide-rule">
            {due.map((h) => {
              const s = habitStats(h, data.logs, data.todayKey);
              return (
                <li key={h.id} className="flex min-h-12 items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.title}</span>
                    <span className="text-micro text-ink-2">
                      {s.weekTarget ? `${s.weekDone}/${s.weekTarget} this week` : s.streak ? `${s.streak}-day streak` : h.kind === "check_in" ? "Honest yes/no" : ""}
                    </span>
                  </span>
                  <HabitLogButtons habit={h} dateKey={data.todayKey} status={s.todayLog?.status ?? null} size="lg" />
                </li>
              );
            })}
          </ul>
        </Section>
      ) : (
        <p className="text-small text-ink-2">
          <Link href="/habits" onClick={onClose} className="underline underline-offset-4">
            Set up habits
          </Link>{" "}
          like the phone-down check-in to log them here.
        </p>
      )}
      <p className="text-micro text-ink-3">Check-ins are self-report. LifeOS can&apos;t see or block other apps on your phone.</p>
    </div>
  );
}
