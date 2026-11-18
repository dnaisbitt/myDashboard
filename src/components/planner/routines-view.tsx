"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/profile";
import { HabitLogButtons } from "@/components/plans/habit-controls";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { FocusStat } from "@/lib/data/planner";
import { habitStats, isScheduled } from "@/lib/habits";
import { durationLabel } from "@/lib/time";
import { PLACE_LABEL, type Habit, type HabitLog, type Profile } from "@/lib/types";
import { wakePlan } from "@/lib/wake";

export function RoutinesView({
  profile,
  habits,
  logs,
  focus,
  todayKey,
}: {
  profile: Profile;
  habits: Habit[];
  logs: HabitLog[];
  focus: FocusStat[];
  todayKey: string;
}) {
  const morning = habits.filter((h) => h.part_of_day === "morning");
  const evening = habits.filter((h) => h.part_of_day === "evening");

  const routine = (title: string, items: Habit[], hint: string) => (
    <section className="flex flex-col gap-2">
      <SectionHeader title={title} count={items.length || undefined} />
      {items.length ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {items.map((h) => {
            const s = habitStats(h, logs, todayKey);
            return (
              <li key={h.id} className="flex min-h-12 flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  {h.title}
                  {s.streak ? <span className="ml-2 text-small text-ink-2">{s.streak}-day streak</span> : null}
                </span>
                {isScheduled(h, todayKey) ? <HabitLogButtons habit={h} dateKey={todayKey} status={s.todayLog?.status ?? null} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-small text-ink-2">
          {hint}{" "}
          <Link href="/habits" className="underline underline-offset-4 hover:text-ink">
            Add one in Habits
          </Link>
          .
        </p>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-12">
      <WakePlanCard profile={profile} todayKey={todayKey} />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {routine("Morning routine", morning, "Habits set to “Morning routine” show here.")}
        {routine("Evening routine", evening, "A wind-down habit and the phone-down check-in fit here.")}
      </div>
      <FocusStats stats={focus} />
    </div>
  );
}

function WakePlanCard({ profile, todayKey }: { profile: Profile; todayKey: string }) {
  const [editing, setEditing] = useState(!profile.wake_current);
  const [current, setCurrent] = useState(profile.wake_current?.slice(0, 5) ?? "09:00");
  const [target, setTarget] = useState(profile.wake_target?.slice(0, 5) ?? "07:30");
  const [step, setStep] = useState(String(profile.wake_step_minutes ?? 15));
  const [pending, start] = useTransition();
  const { notify } = useToast();

  const plan =
    profile.wake_current && profile.wake_target && profile.wake_plan_started
      ? wakePlan(profile.wake_current.slice(0, 5), profile.wake_target.slice(0, 5), profile.wake_step_minutes, profile.wake_plan_started, todayKey)
      : null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Becoming a morning person"
        action={
          plan && !editing ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Change plan
            </Button>
          ) : null
        }
      />
      {plan && !editing ? (
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-small text-ink-2">Wake time this week</p>
            <p className="font-display text-h1 leading-none">{plan.thisWeek}</p>
          </div>
          <p className="max-w-[46ch] text-body text-ink-2">
            {plan.done
              ? `You've reached your ${profile.wake_target!.slice(0, 5)} target. Hold it steady.`
              : `Next week ${plan.nextWeek}. ${plan.weeksLeft} week${plan.weeksLeft === 1 ? "" : "s"} to ${profile.wake_target!.slice(0, 5)}, moving ${profile.wake_step_minutes} minutes a week. Small shifts stick; big jumps don't.`}
          </p>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (target >= current) return notify("The target should be earlier than where you are now.", { tone: "error" });
            start(async () => {
              const r = await updateProfile({
                wake_current: current,
                wake_target: target,
                wake_step_minutes: Number(step),
                wake_plan_started: todayKey,
              });
              notify(r.ok ? "Wake plan saved" : r.error, { tone: r.ok ? "ok" : "error" });
              if (r.ok) setEditing(false);
            });
          }}
        >
          <Field label="I usually get up at">{(id) => <Input id={id} type="time" value={current} onChange={(e) => setCurrent(e.target.value)} className="w-32" />}</Field>
          <Field label="I'd like to get up at">{(id) => <Input id={id} type="time" value={target} onChange={(e) => setTarget(e.target.value)} className="w-32" />}</Field>
          <Field label="Move by">
            {(id) => (
              <Select id={id} value={step} onChange={(e) => setStep(e.target.value)} className="w-36">
                <option value="10">10 min a week</option>
                <option value="15">15 min a week</option>
                <option value="20">20 min a week</option>
              </Select>
            )}
          </Field>
          <Button type="submit" variant="primary" pending={pending}>
            Start plan
          </Button>
        </form>
      )}
      <p className="text-small text-ink-3">The bedtime wind-down reminder that supports this arrives with notifications in Phase 7.</p>
    </section>
  );
}

function FocusStats({ stats }: { stats: FocusStat[] }) {
  const total = stats.reduce((s, x) => s + x.blocks, 0);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Where you focus best" count={total ? "last 4 weeks" : undefined} />
      {!total ? (
        <EmptyState
          title="No focus blocks yet"
          body="Add 30 or 60-minute focus blocks with one concrete task and a place (library, home, group room). After each one, answer “did you stay on it?”. This compares the places using your own answers."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {stats.map((s) => {
            const rate = s.answered ? s.stayed / s.answered : null;
            return (
              <li key={s.place} className="grid grid-cols-[120px_1fr_auto] items-center gap-4 py-3">
                <span className="font-medium">{s.place === "untagged" ? "No place set" : PLACE_LABEL[s.place]}</span>
                <span className="flex items-center gap-3">
                  {rate !== null ? <ProgressBar value={rate * 100} label={`Stayed on task rate at ${s.place}`} className="max-w-xs" /> : null}
                  <span className="text-small text-ink-2">
                    {rate !== null ? `${Math.round(rate * 100)}% stayed on it` : "No answers yet"}
                    {s.place === "group_room" ? " · lower-focus by design" : ""}
                  </span>
                </span>
                <span className="text-small text-ink-2">
                  {s.blocks} block{s.blocks === 1 ? "" : "s"} · {durationLabel(s.minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
