"use client";

// DESIGN REVIEW FIXTURE (dev only). Not real data; actions won't save.
import { useEffect, useState } from "react";
import { Meals } from "@/components/body/meals";
import { Sleep } from "@/components/body/sleep";
import { Training } from "@/components/body/training";
import { MoneyOverview } from "@/components/money/money-overview";
import { AppShell } from "@/components/shell/app-shell";
import type { Recipe } from "@/lib/meals";
import { expandSessions } from "@/lib/schedule";
import { addDaysToKey, dateKey, DEFAULT_TZ, localToIso, weekStartKey } from "@/lib/time";
import type { Profile, TimetableSession } from "@/lib/types";

const tz = DEFAULT_TZ;
const profile: Profile = {
  id: "f",
  display_name: "Sam",
  timezone: tz,
  tone: { habits: "gentle", wake: "gentle", deadlines: "direct", exams: "direct", optional: "quiet" },
  trackers: { calories: false, protein: true, lifts: true },
  ai_enabled: false,
  wake_current: "09:00",
  wake_target: "07:30",
  wake_step_minutes: 15,
  wake_plan_started: null,
  bedtime_target: "23:30",
  gym_target_per_week: 4,
  gym_quiet_times: "Weekdays before 8am; Friday afternoons",
  reminders: {},
};

function build(now: number) {
  const today = dateKey(now, tz);
  const ws = weekStartKey(today);
  const s = (id: number, title: string, kind: TimetableSession["kind"], weekday: number, a: string, b: string): TimetableSession => ({
    id: `s${id}`, title, kind, weekday, start_time: `${a}:00`, end_time: `${b}:00`, location: null, starts_on: addDaysToKey(today, -60), ends_on: addDaysToKey(today, 60),
  });
  const sessions = [
    s(1, "Gym", "gym", 1, "07:00", "08:00"), s(2, "Korfball training", "training", 1, "19:00", "21:00"),
    s(3, "Gym", "gym", 3, "17:00", "18:00"), s(4, "Korfball training", "training", 3, "19:00", "21:00"),
    s(5, "Gym", "gym", 5, "16:00", "17:00"), s(6, "BUCS match", "match", 6, "13:00", "16:00"), s(7, "Gym", "gym", 7, "11:00", "12:00"),
  ];
  const weekBlocks = expandSessions(sessions, [], ws, addDaysToKey(ws, 6), tz);
  const nextWeekBlocks = expandSessions(sessions, [], addDaysToKey(today, 1), addDaysToKey(today, 7), tz);
  const term = { id: "t", title: "Autumn term", starts_on: addDaysToKey(ws, -49), ends_on: addDaysToKey(ws, 27), opening_pence: 42000 };
  const txns = Array.from({ length: 40 }, (_, i) => {
    const d = addDaysToKey(today, -Math.floor(i * 1.3));
    const cats = ["Groceries", "Takeaway", "Transport", "Going out", "Eating out", "Sport"];
    return { id: `x${i}`, occurred_on: d, amount_pence: [1840, 1250, 640, 2200, 495, 1500][i % 6] + (i % 5) * 110, category: cats[i % 6], note: i % 4 === 0 ? "Tesco" : null, source: "manual" as const };
  });
  const sleep = Array.from({ length: 24 }, (_, i) => {
    const n = addDaysToKey(today, -24 + i);
    const late = i % 3 !== 0;
    return {
      night_of: n,
      bed_at: late ? localToIso(addDaysToKey(n, 1), `0${(i % 2) + 0}:${i % 2 ? "40" : "15"}`, tz) : localToIso(n, "23:10", tz),
      wake_at: localToIso(addDaysToKey(n, 1), late ? "09:20" : "07:50", tz),
    };
  });
  const nextDay: Array<[string, { tasksDone: number; focusStayed: number; focusAnswered: number }]> = sleep.map((l, i) => [
    addDaysToKey(l.night_of, 1),
    { tasksDone: i % 3 !== 0 ? 2 : 5, focusStayed: i % 3 !== 0 ? 0.5 : 2, focusAnswered: 2 },
  ]);
  const recipes: Recipe[] = [
    { id: "r1", title: "Lean mince bolognese", status: "staple", portions: 2, minutes: 35, protein_g: 110, method: null, ingredients: [{ name: "Lean beef mince", qty: "500", unit: "g" }, { name: "Pasta", qty: "200", unit: "g" }, { name: "Bolognese sauce", qty: "1", unit: "jar" }] },
    { id: "r2", title: "Gnocchi, chicken and pesto", status: "staple", portions: 2, minutes: 20, protein_g: 95, method: null, ingredients: [{ name: "Gnocchi", qty: "500", unit: "g" }, { name: "Chicken breast", qty: "500", unit: "g" }] },
    { id: "r3", title: "Chilli con carne", status: "want_to_try", portions: 2, minutes: 45, protein_g: 100, method: null, ingredients: [] },
  ];
  return {
    today, ws, weekBlocks, nextWeekBlocks, term, txns, sleep, nextDay, recipes,
    plan: [
      { id: "p1", on_date: ws, recipe_id: "r1", note: null },
      { id: "p2", on_date: addDaysToKey(ws, 2), recipe_id: "r2", note: null },
      { id: "p3", on_date: addDaysToKey(ws, 3), recipe_id: "r3", note: null },
      { id: "p4", on_date: addDaysToKey(ws, 5), recipe_id: null, note: "Out with the team" },
    ],
  };
}

export function FixtureLife() {
  const [state, setState] = useState<{ now: number; view: string } | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setState({ now: Date.now(), view: new URLSearchParams(window.location.search).get("view") ?? "money" }));
    return () => window.clearTimeout(t);
  }, []);
  const d = state ? build(state.now) : null;
  return (
    <AppShell bridge={null}>
      <div className="border-b border-dashed border-rule-strong bg-sunken/60 px-5 py-2 text-center text-micro text-ink-2">
        Design fixture for layout review only. Not your data, and actions here won&apos;t save.
      </div>
      {d && state ? (
        <div className="mx-auto w-full max-w-[1120px] px-5 pt-6 sm:px-8 lg:px-12 lg:pt-14">
          {state.view === "money" ? (
            <MoneyOverview
              period={d.term}
              items={[
                { id: "i1", kind: "income", title: "Loan instalment", amount_pence: 310000, cadence: "once", first_on: d.term.starts_on, last_on: null, category: null },
                { id: "i2", kind: "commitment", title: "Rent", amount_pence: 52000, cadence: "monthly", first_on: addDaysToKey(d.term.starts_on, 3), last_on: null, category: null },
                { id: "i3", kind: "commitment", title: "Phone", amount_pence: 1200, cadence: "monthly", first_on: addDaysToKey(d.term.starts_on, 10), last_on: null, category: null },
              ]}
              txns={d.txns}
              savings={[{ id: "g", title: "Summer trip", target_pence: 60000, saved_pence: 21500, target_on: null, goal_id: null }]}
              goals={[]}
              todayKey={d.today}
            />
          ) : state.view === "training" ? (
            <Training
              profile={profile}
              todayKey={d.today}
              weekStart={d.ws}
              weekBlocks={d.weekBlocks}
              nextWeekBlocks={d.nextWeekBlocks}
              workouts={[{ on_date: d.ws, kind: "full" }]}
              booked={[]}
              weights={[{ on_date: addDaysToKey(d.today, -60), kg: 79.6 }, { on_date: addDaysToKey(d.today, -31), kg: 78.9 }, { on_date: addDaysToKey(d.today, -3), kg: 78.1 }]}
              lifts={[1, 2, 3, 4].map((i) => ({ id: `l${i}`, on_date: addDaysToKey(d.today, -i * 7), lift: "Squat", kg: 100 - i * 2.5, reps: 5 }))}
              tz={tz}
            />
          ) : state.view === "sleep" ? (
            <Sleep profile={profile} sleep={d.sleep} nextDay={d.nextDay} todayKey={d.today} tz={tz} />
          ) : (
            <Meals
              profile={profile}
              weekStart={d.ws}
              todayKey={d.today}
              recipes={d.recipes}
              plan={d.plan}
              blocks={d.weekBlocks}
              shopping={[
                { id: "a", name: "Lean beef mince", qty: "500 g", source: "plan", week_of: d.ws, checked: false },
                { id: "b", name: "Pasta", qty: "200 g", source: "plan", week_of: d.ws, checked: true },
              ]}
              shoppingTasks={[{ id: "t", title: "buy oats" }]}
              today={null}
              tz={tz}
            />
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
