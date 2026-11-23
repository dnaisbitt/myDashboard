"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { addLift, deleteLift, logWorkout, saveGymSettings, saveWeighIn, setGymBooked } from "@/app/actions/body";
import { deleteSession, saveSession } from "@/app/actions/timetable";
import { ChartFrame, LineChart } from "@/components/charts/charts";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { weekLoad } from "@/lib/body";
import { cn } from "@/lib/cn";
import type { LiftEntry, WeighIn, Workout } from "@/lib/data/life";
import type { Block } from "@/lib/schedule";
import { addDaysToKey, daysBetweenKeys, formatTime, keyLabel } from "@/lib/time";
import type { Profile } from "@/lib/types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Training({
  profile,
  todayKey,
  weekStart,
  weekBlocks,
  nextWeekBlocks,
  workouts,
  booked,
  weights,
  lifts,
  tz,
}: {
  profile: Profile;
  todayKey: string;
  weekStart: string;
  weekBlocks: Block[];
  nextWeekBlocks: Block[];
  workouts: Workout[];
  booked: string[];
  weights: WeighIn[];
  lifts: LiftEntry[];
  tz: string;
}) {
  const target = profile.gym_target_per_week;
  const live = weekBlocks.filter((b) => !b.cancelled);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));
  const doneDays = new Set(workouts.filter((w) => w.on_date >= weekStart).map((w) => w.on_date));
  // Gym counts once per day: a planned gym block or a logged workout.
  const gymDays = days.filter((k) => doneDays.has(k) || live.some((b) => b.dateKey === k && b.kind === "gym"));
  const load = weekLoad(
    {
      gym: gymDays,
      training: live.filter((b) => b.kind === "training").map((b) => b.dateKey),
      matches: live.filter((b) => b.kind === "match").map((b) => b.dateKey),
      weekStart,
    },
    target,
  );
  const doneThisWeek = [...doneDays].length;
  const todayWorkout = workouts.find((w) => w.on_date === todayKey);
  const gymSessions = [...weekBlocks, ...nextWeekBlocks].filter((b) => b.kind === "gym" && b.source === "session");
  const weeklyGym = [...new Map(gymSessions.map((b) => [b.id, b.session!])).values()].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  const upcomingGym = nextWeekBlocks.filter((b) => b.kind === "gym" && !b.cancelled).slice(0, 4);

  return (
    <div className="flex flex-col gap-12">
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-4">
          <SectionHeader title="This week's load" />
          <div className="flex items-end gap-6">
            <p>
              <span className="font-display text-[3.25rem] leading-none">{doneThisWeek}</span>
              <span className="text-lead text-ink-2"> / {target} gym</span>
            </p>
            <p className="pb-1 text-small text-ink-2">
              + {load.training} training · {load.matches} match{load.matches === 1 ? "" : "es"} · {load.restDays} rest day{load.restDays === 1 ? "" : "s"}
            </p>
          </div>
          <p className={cn("text-body", load.level === "too much" ? "font-medium text-danger" : load.level === "high" ? "text-ink" : "text-ink-2")}>
            {load.advice}
          </p>
          <ol className="grid grid-cols-7 gap-1" aria-label="This week by day">
            {days.map((k, i) => {
              const dayBlocks = live.filter((b) => b.dateKey === k && (b.kind === "gym" || b.kind === "training" || b.kind === "match"));
              const done = doneDays.has(k);
              return (
                <li key={k} className={cn("flex min-h-20 flex-col gap-1 rounded-sm border border-rule p-1.5", k === todayKey && "border-ink")}>
                  <span className="text-micro text-ink-2">{DAY_NAMES[i]}</span>
                  {done ? <span className="rounded-[3px] bg-ink px-1 text-micro text-canvas">Gym ✓</span> : null}
                  {dayBlocks
                    .filter((b) => !(b.kind === "gym" && done))
                    .map((b) => (
                      <span key={b.key} className={cn("truncate rounded-[3px] px-1 text-micro", b.kind === "gym" ? "border border-dashed border-ink-3" : "bg-sunken")}>
                        {b.kind === "gym" ? "Gym" : b.kind === "match" ? "Match" : "Training"}
                      </span>
                    ))}
                  {!dayBlocks.length && !done ? <span className="mt-auto text-micro text-ink-3">rest</span> : null}
                </li>
              );
            })}
          </ol>
          <p className="text-micro text-ink-3">Dashed = planned · filled = done.</p>
        </div>
        <div className="flex flex-col gap-4">
          <SectionHeader title="Today" />
          <WorkoutButtons todayKey={todayKey} current={todayWorkout?.kind ?? null} />
          {upcomingGym.length ? (
            <div className="mt-2 flex flex-col gap-2">
              <SectionHeader title="Book your slot" />
              <ul className="flex flex-col divide-y divide-rule border-y border-rule">
                {upcomingGym.map((b) => (
                  <BookingRow key={b.key} block={b} booked={booked.includes(b.dateKey)} tz={tz} todayKey={todayKey} />
                ))}
              </ul>
              {profile.gym_quiet_times ? <p className="text-small text-ink-2">Quieter times: {profile.gym_quiet_times}</p> : null}
              <p className="text-micro text-ink-3">There&apos;s no link to the uni booking system. This is a reminder list; the push reminder arrives in Phase 7.</p>
            </div>
          ) : null}
        </div>
      </section>

      <GymDays sessions={weeklyGym} todayKey={todayKey} target={target} />
      <GymSettings profile={profile} />
      {profile.trackers.lifts ? <Lifts lifts={lifts} todayKey={todayKey} /> : null}
      <WeighIns weights={weights} todayKey={todayKey} />
    </div>
  );
}

export function WorkoutButtons({ todayKey, current, size = "md" }: { todayKey: string; current: "full" | "minimum" | null; size?: "md" | "lg" }) {
  const [opt, setOpt] = useOptimistic(current);
  const [, start] = useTransition();
  const { notify } = useToast();
  const set = (k: "full" | "minimum") =>
    start(async () => {
      const next = opt === k ? null : k;
      setOpt(next);
      const r = await logWorkout(todayKey, next);
      notify(r.ok ? (next ? (next === "full" ? "Gym logged" : "Minimum version logged, it counts") : "Cleared") : r.error, { tone: r.ok ? "ok" : "error" });
    });
  const cls = (active: boolean) =>
    cn(
      "rounded-sm border font-medium transition-colors active:scale-95",
      size === "lg" ? "h-10 px-4 text-body" : "h-10 px-4 text-body",
      active ? "border-ink bg-ink text-canvas" : "border-rule text-ink-2 hover:border-rule-strong hover:text-ink",
    );
  return (
    <div className="flex gap-2" role="group" aria-label="Gym today">
      <button type="button" aria-pressed={opt === "full"} className={cls(opt === "full")} onClick={() => set("full")}>
        Gym done
      </button>
      <button type="button" aria-pressed={opt === "minimum"} className={cls(opt === "minimum")} onClick={() => set("minimum")}>
        Minimum (30 min)
      </button>
    </div>
  );
}

function BookingRow({ block, booked, tz, todayKey }: { block: Block; booked: boolean; tz: string; todayKey: string }) {
  const [opt, setOpt] = useOptimistic(booked);
  const [, start] = useTransition();
  const { notify } = useToast();
  const soon = daysBetweenKeys(todayKey, block.dateKey) <= 1;
  return (
    <li className="flex min-h-11 items-center gap-3 py-1.5">
      <span className="flex-1">
        {keyLabel(block.dateKey)} · {formatTime(block.startsAt, tz)}
        {!opt && soon ? <span className="ml-2 text-small font-medium text-danger">not booked</span> : null}
      </span>
      <label className="flex cursor-pointer items-center gap-2 text-small text-ink-2">
        <input
          type="checkbox"
          checked={opt}
          onChange={(e) =>
            start(async () => {
              setOpt(e.target.checked);
              const r = await setGymBooked(block.dateKey, e.target.checked);
              if (!r.ok) notify(r.error, { tone: "error" });
            })
          }
          className="size-4 accent-[var(--ink)]"
        />
        Booked
      </label>
    </li>
  );
}

function GymDays({ sessions, todayKey, target }: { sessions: NonNullable<Block["session"]>[]; todayKey: string; target: number }) {
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("17:00");
  const [mins, setMins] = useState(60);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Pre-decided gym days" count={`${sessions.length} a week`} />
      <p className="max-w-[62ch] text-small text-ink-2">
        Decide once, not every morning. These repeat weekly around lectures and korfball, show on Today and in the Planner, and can be
        cancelled for a single week. {target} is the committed baseline.
      </p>
      {sessions.length ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {sessions.map((s) => (
            <li key={s.id} className="flex min-h-11 items-center gap-3 py-1.5">
              <span className="w-12 text-small text-ink-2">{DAY_NAMES[s.weekday - 1]}</span>
              <span className="flex-1">
                {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} {s.title !== "Gym" ? `· ${s.title}` : ""}
              </span>
              <IconButton
                label={`Remove ${DAY_NAMES[s.weekday - 1]} gym day`}
                size="sm"
                onClick={() =>
                  start(async () => {
                    const r = await deleteSession(s.id);
                    notify(r.ok ? "Gym day removed" : r.error, { tone: r.ok ? "ok" : "error" });
                  })
                }
              >
                <X size={14} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const [h, m] = time.split(":").map(Number);
          const endM = Math.min(23 * 60 + 59, h * 60 + m + mins);
          const end = `${String(Math.floor(endM / 60)).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`;
          start(async () => {
            const r = await saveSession({
              title: "Gym",
              kind: "gym",
              weekday: day,
              startTime: time,
              endTime: end,
              location: null,
              startsOn: todayKey,
              endsOn: addDaysToKey(todayKey, 7 * 26),
            });
            notify(r.ok ? `Gym every ${DAY_NAMES[day - 1]}` : r.error, { tone: r.ok ? "ok" : "error" });
          });
        }}
      >
        <Field label="Day">
          {(id) => (
            <Select id={id} value={day} onChange={(e) => setDay(Number(e.target.value))} className="w-28">
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Time">{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />}</Field>
        <Field label="Length">
          {(id) => (
            <Select id={id} value={mins} onChange={(e) => setMins(Number(e.target.value))} className="w-28">
              {[30, 45, 60, 75, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" pending={pending}>
          Add gym day
        </Button>
        <Link href="/planner/timetable" className="pb-2.5 text-small text-ink-2 underline underline-offset-4 hover:text-ink">
          See with your timetable
        </Link>
      </form>
    </section>
  );
}

function GymSettings({ profile }: { profile: Profile }) {
  const [target, setTarget] = useState(profile.gym_target_per_week);
  const [quiet, setQuiet] = useState(profile.gym_quiet_times ?? "");
  const [pending, start] = useTransition();
  const { notify } = useToast();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Gym notes" />
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveGymSettings({ gymTargetPerWeek: target, gymQuietTimes: quiet || null });
            notify(r.ok ? "Saved" : r.error, { tone: r.ok ? "ok" : "error" });
          });
        }}
      >
        <Field label="Baseline per week">
          {(id) => (
            <Select id={id} value={target} onChange={(e) => setTarget(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} days{n === 4 ? " (recommended)" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Quieter times you've noticed">
          {(id) => <Textarea id={id} value={quiet} onChange={(e) => setQuiet(e.target.value)} maxLength={300} className="min-h-10" />}
        </Field>
        <Button type="submit" pending={pending}>
          Save
        </Button>
      </form>
    </section>
  );
}

function Lifts({ lifts, todayKey }: { lifts: LiftEntry[]; todayKey: string }) {
  const [lift, setLift] = useState("Squat");
  const [kg, setKg] = useState("");
  const [reps, setReps] = useState("5");
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const names = [...new Set(lifts.map((l) => l.lift))];

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Key lifts" count="optional tracker" />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addLift({ onDate: todayKey, lift, kg: Number(kg), reps: Number(reps) });
            notify(r.ok ? "Logged" : r.error, { tone: r.ok ? "ok" : "error" });
            if (r.ok) setKg("");
          });
        }}
      >
        <Field label="Lift">
          {(id) => (
            <>
              <Input id={id} list="lift-names" value={lift} onChange={(e) => setLift(e.target.value)} className="w-36" maxLength={40} />
              <datalist id="lift-names">
                {[...new Set([...names, "Squat", "Bench", "Deadlift", "Overhead press", "Pull-up"])].map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Top set kg">{(id) => <Input id={id} inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} className="w-24" required />}</Field>
        <Field label="Reps">{(id) => <Input id={id} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} className="w-20" required />}</Field>
        <Button type="submit" pending={pending}>
          Log
        </Button>
      </form>
      {names.length ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {names.map((n) => {
            const rows = lifts.filter((l) => l.lift === n);
            // top set per day
            const perDay = [...new Map(rows.map((r) => [r.on_date, rows.filter((x) => x.on_date === r.on_date).sort((a, b) => b.kg - a.kg)[0]])).values()];
            return (
              <ChartFrame
                key={n}
                title={n}
                subtitle="top set, kg"
                table={{ columns: ["Date", "Top set"], rows: perDay.map((r) => ({ label: keyLabel(r.on_date), value: `${r.kg} kg × ${r.reps}` })) }}
              >
                {perDay.length >= 2 ? (
                  <LineChart
                    height={120}
                    points={perDay.map((r) => ({ key: r.on_date, x: Date.parse(r.on_date), y: r.kg, label: keyLabel(r.on_date), display: `${r.kg} kg × ${r.reps}` }))}
                    format={(v) => `${Math.round(v)}`}
                    xLabels={[perDay[0], perDay.at(-1)!].map((r) => ({ x: Date.parse(r.on_date), label: keyLabel(r.on_date, { day: "numeric", month: "short" }) }))}
                  />
                ) : (
                  <ul className="text-small text-ink-2">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center gap-2">
                        {keyLabel(r.on_date)}: {r.kg} kg × {r.reps}
                        <IconButton label="Delete entry" size="sm" onClick={() => start(async () => void (await deleteLift(r.id)))}>
                          <X size={12} aria-hidden />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartFrame>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function WeighIns({ weights, todayKey }: { weights: WeighIn[]; todayKey: string }) {
  const [kg, setKg] = useState("");
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const last = weights.at(-1);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Weight" count="whenever you get the chance" />
      <p className="text-small text-ink-2">
        {last ? `Last weigh-in ${keyLabel(last.on_date)}: ${last.kg} kg.` : "No weigh-ins yet."} No reminders for this, ever. Log it when you&apos;re near scales.
      </p>
      {weights.length >= 2 ? (
        <ChartFrame title="Weight" subtitle="kg" table={{ columns: ["Date", "kg"], rows: weights.map((w) => ({ label: keyLabel(w.on_date), value: `${w.kg}` })) }}>
          <LineChart
            height={120}
            points={weights.map((w) => ({ key: w.on_date, x: Date.parse(w.on_date), y: w.kg, label: keyLabel(w.on_date), display: `${w.kg} kg` }))}
            format={(v) => `${Math.round(v)}`}
            xLabels={[weights[0], weights.at(-1)!].map((w) => ({ x: Date.parse(w.on_date), label: keyLabel(w.on_date, { day: "numeric", month: "short" }) }))}
          />
        </ChartFrame>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveWeighIn(todayKey, Number(kg));
            notify(r.ok ? "Weigh-in saved" : r.error, { tone: r.ok ? "ok" : "error" });
            if (r.ok) setKg("");
          });
        }}
      >
        <Field label="Today (kg)">{(id) => <Input id={id} inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} className="w-28" required />}</Field>
        <Button type="submit" pending={pending}>
          Save
        </Button>
      </form>
    </section>
  );
}
