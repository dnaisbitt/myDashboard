"use client";

import { useEffect, useState } from "react";
import { PlannerView, type PlannerViewName } from "@/components/planner/planner-view";
import { AppShell } from "@/components/shell/app-shell";
import { eventToBlock, expandSessions, sortBlocks } from "@/lib/schedule";
import { addDaysToKey, dateKey, DEFAULT_TZ, localToIso, weekStartKey } from "@/lib/time";
import type { CalendarEvent, Task, TimetableSession } from "@/lib/types";

// DESIGN REVIEW FIXTURE (dev only). Not real data.
const tz = DEFAULT_TZ;

function build(nowMs: number) {
  const today = dateKey(nowMs, tz);
  const mon = weekStartKey(today);
  const s = (id: number, title: string, weekday: number, start: string, end: string, kind: TimetableSession["kind"] = "lecture"): TimetableSession => ({
    id: `00000000-0000-0000-0003-${String(id).padStart(12, "0")}`,
    title,
    kind,
    weekday,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    location: null,
    starts_on: addDaysToKey(today, -40),
    ends_on: addDaysToKey(today, 40),
  });
  const sessions = [
    s(1, "Korfball training", 1, "07:00", "08:30", "training"),
    s(2, "Machine Learning", 1, "10:00", "12:00"),
    s(3, "Statistics", 2, "13:00", "15:00"),
    s(4, "Korfball training", 3, "19:00", "21:00", "training"),
    s(5, "Algorithms", 3, "09:00", "11:00"),
    s(6, "Machine Learning lab", 4, "14:00", "16:00", "lab"),
    s(7, "Korfball training", 5, "18:00", "20:00", "training"),
    s(8, "BUCS match", 6, "13:00", "16:00", "match"),
  ];
  const ev = (id: number, title: string, kind: CalendarEvent["kind"], day: number, start: string, end: string): CalendarEvent => ({
    id: `00000000-0000-0000-0001-${String(id).padStart(12, "0")}`,
    title,
    kind,
    starts_at: localToIso(addDaysToKey(mon, day), start, tz),
    ends_at: localToIso(addDaysToKey(mon, day), end, tz),
    location: null,
    notes: null,
    task_id: null,
    place: kind === "focus" ? "library" : null,
    outcome: null,
  });
  const events = [
    ev(1, "10 past-paper Qs, Ch. 4", "focus", 1, "16:00", "17:00"),
    ev(2, "Gym (minimum version)", "gym", 2, "17:30", "18:00"),
    ev(3, "Coursework section 2", "focus", 3, "19:00", "20:30"),
    ev(4, "Dentist", "event", 1, "16:30", "17:15"),
    ev(5, "Gym", "gym", 3, "07:30", "08:30"),
  ];
  const t = (id: number, title: string, extra: Partial<Task>): Task => ({
    id: `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`,
    title,
    notes: null,
    status: "open",
    priority: 2,
    due_at: null,
    due_has_time: false,
    today_date: null,
    today_rank: null,
    completed_at: null,
    project_id: null,
    parent_id: null,
    category: null,
    recurrence: null,
    planned_on: null,
    estimate_minutes: null,
    snoozed_until: null,
    created_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
    ...extra,
  });
  const blocks = sortBlocks([
    ...events.map((e) => eventToBlock(e, dateKey(e.starts_at, tz))),
    ...expandSessions(sessions, [{ session_id: sessions[2].id, on_date: addDaysToKey(mon, 1) }], mon, addDaysToKey(mon, 41), tz),
  ]);
  return {
    today,
    blocks,
    tasks: [
      t(1, "Coursework 2 report", { due_at: localToIso(addDaysToKey(mon, 4), "17:00", tz), due_has_time: true }),
      t(2, "Book gym slot", { planned_on: addDaysToKey(mon, 1) }),
      t(3, "Read 2 papers", { planned_on: addDaysToKey(mon, 3), estimate_minutes: 90 }),
    ],
    overdue: [t(4, "Return library books", { due_at: localToIso(addDaysToKey(today, -2), "23:59", tz) })],
  };
}

export function FixturePlanner() {
  const [state, setState] = useState<{ now: number; view: PlannerViewName } | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const v = new URLSearchParams(window.location.search).get("view");
      setState({ now: Date.now(), view: v === "day" || v === "month" ? v : "week" });
    });
    return () => window.clearTimeout(id);
  }, []);
  const d = state ? build(state.now) : null;
  return (
    <AppShell bridge={null}>
      <div className="border-b border-dashed border-rule-strong bg-sunken/60 px-5 py-2 text-center text-micro text-ink-2">
        Design fixture for layout review only. Not your data, and actions here won&apos;t save.
      </div>
      {d && state ? (
        <div className="mx-auto w-full max-w-[1180px] px-5 pt-6 sm:px-8 lg:px-12 lg:pt-14">
          <PlannerView view={state.view} anchor={d.today} todayKey={d.today} blocks={d.blocks} tasks={d.tasks} overdue={d.overdue} tz={tz} nowMs={state.now} />
        </div>
      ) : null}
    </AppShell>
  );
}
