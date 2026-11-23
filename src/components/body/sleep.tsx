"use client";

import { BedDouble, Sunrise } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteSleep, logSleepNow, saveBedtimeTarget, saveSleep } from "@/app/actions/body";
import { ChartFrame, SleepChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { bedClock, bedMinutes, hoursSlept, sleepChain, wakeMinutes, type SleepLog } from "@/lib/body";
import { addDaysToKey, formatTime, keyLabel, localToIso, minutesToTime, timeToMinutes } from "@/lib/time";
import type { Profile } from "@/lib/types";

export function Sleep({
  profile,
  sleep,
  nextDay,
  todayKey,
  tz,
}: {
  profile: Profile;
  sleep: SleepLog[];
  nextDay: Array<[string, { tasksDone: number; focusStayed: number; focusAnswered: number }]>;
  todayKey: string;
  tz: string;
}) {
  const [editing, setEditing] = useState<SleepLog | null>(null);
  const last28 = Array.from({ length: 28 }, (_, i) => addDaysToKey(todayKey, i - 28));
  const byNight = new Map(sleep.map((s) => [s.night_of, s]));
  const target = profile.bedtime_target ? timeToMinutes(profile.bedtime_target.slice(0, 5)) : null;
  const targetAfter18 = target === null ? null : target >= 18 * 60 ? target - 18 * 60 : target + 6 * 60;

  const recent = sleep.filter((s) => s.night_of >= addDaysToKey(todayKey, -7));
  const avg = (xs: Array<number | null>) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const avgBed = avg(recent.map((s) => bedMinutes(s, tz)));
  const avgWake = avg(recent.map((s) => wakeMinutes(s, tz)));
  const avgHours = (() => {
    const v = recent.map(hoursSlept).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  })();
  const onTarget = targetAfter18 === null ? null : recent.filter((s) => (bedMinutes(s, tz) ?? 9999) <= targetAfter18 + 15).length;
  const chain = sleepChain(sleep, new Map(nextDay), tz, targetAfter18 ?? 6 * 60);

  return (
    <div className="flex flex-col gap-12">
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="flex flex-col gap-4">
          <SectionHeader title="Log it now" />
          <QuickSleep />
          <BedtimeTarget profile={profile} />
        </div>
        <div className="flex flex-col gap-4">
          <SectionHeader title="Last 7 nights" />
          {recent.length ? (
            <dl className="grid grid-cols-3 gap-4">
              <div>
                <dt className="text-small text-ink-2">In bed, average</dt>
                <dd className="font-display text-h2">{avgBed !== null ? bedClock(avgBed) : "–"}</dd>
              </div>
              <div>
                <dt className="text-small text-ink-2">Up, average</dt>
                <dd className="font-display text-h2">{avgWake !== null ? minutesToTime(avgWake) : "–"}</dd>
              </div>
              <div>
                <dt className="text-small text-ink-2">Sleep</dt>
                <dd className="font-display text-h2">{avgHours !== null ? `${avgHours.toFixed(1)}h` : "–"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-small text-ink-2">Log a few nights and averages appear here.</p>
          )}
          {onTarget !== null && recent.length ? (
            <p className="text-small text-ink-2">
              In bed by {profile.bedtime_target!.slice(0, 5)} on {onTarget} of {recent.length} night{recent.length === 1 ? "" : "s"}.
            </p>
          ) : null}
          <p className="text-small text-ink-2">
            Moving your wake time earlier gradually lives in{" "}
            <Link href="/planner/routines" className="underline underline-offset-4 hover:text-ink">
              Routines
            </Link>
            .
          </p>
        </div>
      </section>

      <ChartFrame
        title="Last 4 weeks"
        subtitle={targetAfter18 !== null ? "each column runs from bedtime down to wake time · line = bedtime target" : "each column runs from bedtime down to wake time"}
        table={{
          columns: ["Night", "Bed → up"],
          rows: last28
            .map((k) => byNight.get(k))
            .filter((s): s is SleepLog => Boolean(s))
            .map((s) => ({ label: keyLabel(s.night_of), value: describe(s, tz) })),
        }}
      >
        <SleepChart
          nights={last28.map((k) => {
            const s = byNight.get(k);
            return {
              key: k,
              label: `Night of ${keyLabel(k)}`,
              short: keyLabel(k, { day: "numeric" }),
              bed: s ? bedMinutes(s, tz) : null,
              wake: s ? wakeMinutes(s, tz) : null,
              display: s ? describe(s, tz) : "not logged",
            };
          })}
          target={targetAfter18 !== null ? { minutes: targetAfter18, label: `bed by ${profile.bedtime_target!.slice(0, 5)}` } : undefined}
        />
      </ChartFrame>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Late night → hard morning → slow day?" />
        {chain ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {(
              [
                ["early", `In bed by ${chain.lateThreshold}`],
                ["late", `In bed after ${chain.lateThreshold}`],
              ] as const
            ).map(([k, title]) => {
              const s = chain[k];
              return (
                <div key={k} className="flex flex-col gap-1 border-l-2 border-rule pl-4">
                  <p className="font-medium">
                    {title} <span className="font-normal text-ink-2">· {s.nights} nights</span>
                  </p>
                  <p className="text-small text-ink-2">Up at {s.avgWake !== null ? minutesToTime(s.avgWake) : "–"} on average</p>
                  <p className="text-small text-ink-2">{s.avgTasks} tasks done the next day</p>
                  <p className="text-small text-ink-2">
                    {s.focusRate !== null ? `Stayed on ${Math.round(s.focusRate * 100)}% of next-day focus blocks` : "No focus-block answers yet"}
                  </p>
                </div>
              );
            })}
            <p className="text-small text-ink-3 sm:col-span-2">
              From your own logs only. It shows a pattern, not a cause, and gets more reliable the more nights you log.
            </p>
          </div>
        ) : (
          <EmptyState
            title="Not enough nights yet"
            body="Once you've logged at least 3 nights either side of your bedtime target, this compares the next day's wake time, tasks done and focus-block answers."
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Nights" />
        {sleep.length ? (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {[...sleep].reverse().slice(0, 14).map((s) => (
              <li key={s.night_of}>
                <button type="button" onClick={() => setEditing(s)} className="flex min-h-11 w-full items-center gap-4 py-2 text-left hover:bg-sunken/40">
                  <span className="w-28 shrink-0 text-small text-ink-2">{keyLabel(s.night_of)}</span>
                  <span className="flex-1">{describe(s, tz)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing({ night_of: addDaysToKey(todayKey, -1), bed_at: null, wake_at: null })}
          className="self-start text-small text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          Add a night you forgot
        </button>
      </section>

      <NightDialog night={editing} onClose={() => setEditing(null)} tz={tz} />
    </div>
  );
}

function describe(s: SleepLog, tz: string) {
  const h = hoursSlept(s);
  if (s.bed_at && s.wake_at) return `${formatTime(s.bed_at, tz)} → ${formatTime(s.wake_at, tz)} · ${h!.toFixed(1)}h`;
  if (s.bed_at) return `in bed ${formatTime(s.bed_at, tz)} · wake not logged`;
  if (s.wake_at) return `up ${formatTime(s.wake_at, tz)} · bedtime not logged`;
  return "not logged";
}

export function QuickSleep({ large }: { large?: boolean }) {
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const go = (which: "bed" | "wake") =>
    start(async () => {
      const r = await logSleepNow(which);
      notify(r.ok ? (which === "bed" ? "Goodnight. Bedtime logged" : "Morning. Wake time logged") : r.error, { tone: r.ok ? "ok" : "error" });
    });
  const cls = large ? "h-12 flex-1 text-body" : "h-10";
  return (
    <div className="flex gap-2">
      <Button className={cls} disabled={pending} onClick={() => go("bed")}>
        <BedDouble size={16} aria-hidden />
        Going to bed
      </Button>
      <Button className={cls} disabled={pending} onClick={() => go("wake")}>
        <Sunrise size={16} aria-hidden />
        Just got up
      </Button>
    </div>
  );
}

function BedtimeTarget({ profile }: { profile: Profile }) {
  const [t, setT] = useState(profile.bedtime_target?.slice(0, 5) ?? "23:30");
  const [pending, start] = useTransition();
  const { notify } = useToast();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBedtimeTarget(t || null);
          notify(r.ok ? "Bedtime target saved" : r.error, { tone: r.ok ? "ok" : "error" });
        });
      }}
    >
      <Field label="Bedtime target" hint="The wind-down reminder (Phase 7) works back from this.">
        {(id, d) => <Input id={id} aria-describedby={d} type="time" value={t} onChange={(e) => setT(e.target.value)} className="w-32" />}
      </Field>
      <Button type="submit" pending={pending} className="mb-6">
        Save
      </Button>
    </form>
  );
}

function NightDialog({ night, onClose, tz }: { night: SleepLog | null; onClose: () => void; tz: string }) {
  return (
    <Dialog open={Boolean(night)} onClose={onClose} title={night ? `Night of ${keyLabel(night.night_of)}` : "Night"}>
      {night ? <NightForm key={night.night_of} night={night} onClose={onClose} tz={tz} /> : null}
    </Dialog>
  );
}

function NightForm({ night, onClose, tz }: { night: SleepLog; onClose: () => void; tz: string }) {
  const [nightOf, setNightOf] = useState(night.night_of);
  const [bed, setBed] = useState(night.bed_at ? formatTime(night.bed_at, tz) : "23:30");
  const [wake, setWake] = useState(night.wake_at ? formatTime(night.wake_at, tz) : "08:00");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const exists = Boolean(night.bed_at || night.wake_at);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        // Bedtimes before noon belong to the small hours after night_of.
        const bedKey = timeToMinutes(bed) < 12 * 60 ? addDaysToKey(nightOf, 1) : nightOf;
        start(async () => {
          const r = await saveSleep({
            nightOf,
            bedAt: bed ? localToIso(bedKey, bed, tz) : null,
            wakeAt: wake ? localToIso(addDaysToKey(nightOf, 1), wake, tz) : null,
          });
          if (!r.ok) return setError(r.error);
          notify("Night saved");
          onClose();
        });
      }}
    >
      <Field label="Night of" hint="The evening it started">
        {(id, d) => <Input id={id} aria-describedby={d} type="date" value={nightOf} onChange={(e) => setNightOf(e.target.value)} disabled={exists} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Into bed">{(id) => <Input id={id} type="time" value={bed} onChange={(e) => setBed(e.target.value)} />}</Field>
        <Field label="Up (next morning)">{(id) => <Input id={id} type="time" value={wake} onChange={(e) => setWake(e.target.value)} />}</Field>
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {exists ? (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          Save
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        pending={pending}
        title="Delete this night?"
        body={`The log for the night of ${keyLabel(night.night_of)} will be removed.`}
        onConfirm={() =>
          start(async () => {
            const r = await deleteSleep(night.night_of);
            setConfirming(false);
            if (!r.ok) return setError(r.error);
            notify("Deleted");
            onClose();
          })
        }
      />
    </form>
  );
}
