"use client";

import { useState, useTransition } from "react";
import { archiveHabit, deleteHabit, saveHabit } from "@/app/actions/plans";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Habit } from "@/lib/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HabitDialog({
  open,
  onClose,
  habit,
  goals,
}: {
  open: boolean;
  onClose: () => void;
  habit?: Habit;
  goals: Array<{ id: string; title: string }>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={habit ? "Edit habit" : "New habit"}>
      {open ? <HabitForm habit={habit} goals={goals} onClose={onClose} /> : null}
    </Dialog>
  );
}

function HabitForm({ habit, goals, onClose }: { habit?: Habit; goals: Array<{ id: string; title: string }>; onClose: () => void }) {
  const [title, setTitle] = useState(habit?.title ?? "");
  const [kind, setKind] = useState<Habit["kind"]>(habit?.kind ?? "build");
  const [frequency, setFrequency] = useState<Habit["frequency"]>(habit?.frequency ?? "daily");
  const [target, setTarget] = useState(habit?.target_per_week ?? 4);
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? []);
  const [part, setPart] = useState<Habit["part_of_day"]>(habit?.part_of_day ?? "any");
  const [minimum, setMinimum] = useState(habit?.minimum_version ?? "");
  const [goalId, setGoalId] = useState(habit?.goal_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await saveHabit({
            id: habit?.id,
            title,
            kind,
            frequency,
            targetPerWeek: frequency === "weekly" ? target : null,
            weekdays: frequency === "days" ? weekdays : null,
            partOfDay: part,
            minimumVersion: kind === "build" ? minimum || null : null,
            goalId: goalId || null,
          });
          if (!r.ok) return setError(r.error);
          notify(habit ? "Habit saved" : "Habit added");
          onClose();
        });
      }}
    >
      <Field label="Habit">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus />}</Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-small font-medium">Type</span>
        <Segmented
          label="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "build", label: "Something I do" },
            { value: "check_in", label: "Yes/no check-in" },
          ]}
        />
        <p className="text-small text-ink-2">
          {kind === "check_in"
            ? "An honest daily answer, e.g. “Kept my phone down?” LifeOS can't see your phone; this is self-report."
            : "Log it when it's done. A minimum version can still count on tired days."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="How often">
          {(id) => (
            <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as Habit["frequency"])}>
              <option value="daily">Every day</option>
              <option value="weekly">Times per week</option>
              <option value="days">Specific days</option>
            </Select>
          )}
        </Field>
        <Field label="Part of day">
          {(id) => (
            <Select id={id} value={part} onChange={(e) => setPart(e.target.value as Habit["part_of_day"])}>
              <option value="any">Any time</option>
              <option value="morning">Morning routine</option>
              <option value="evening">Evening routine</option>
            </Select>
          )}
        </Field>
      </div>
      {frequency === "weekly" ? (
        <Field label="Times per week" hint={title.toLowerCase().includes("gym") ? "4 is the committed baseline; 5–6 is a bonus when the week allows." : undefined}>
          {(id, d) => (
            <Input id={id} aria-describedby={d} type="number" min={1} max={7} value={target} onChange={(e) => setTarget(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} className="w-24" />
          )}
        </Field>
      ) : null}
      {frequency === "days" ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
          {DAYS.map((d, i) => {
            const n = i + 1;
            const on = weekdays.includes(n);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== n) : [...weekdays, n])}
                className={cn("h-8 w-11 rounded-sm border text-small", on ? "border-ink bg-ink text-canvas" : "border-rule text-ink-2")}
              >
                {d}
              </button>
            );
          })}
        </div>
      ) : null}
      {kind === "build" ? (
        <Field label="Minimum version" hint="What still counts on a tired day, e.g. “30 minutes, any session”.">
          {(id, d) => <Input id={id} aria-describedby={d} value={minimum} onChange={(e) => setMinimum(e.target.value)} maxLength={200} />}
        </Field>
      ) : null}
      <Field label="Supports goal">
        {(id) => (
          <Select id={id} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">No goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {habit ? (
          <>
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                start(async () => {
                  const r = await archiveHabit(habit.id, !habit.archived_at);
                  notify(r.ok ? (habit.archived_at ? "Habit restored" : "Habit archived, history kept") : r.error, { tone: r.ok ? "ok" : "error" });
                  if (r.ok) onClose();
                })
              }
            >
              {habit.archived_at ? "Restore" : "Archive"}
            </Button>
          </>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          {habit ? "Save" : "Add habit"}
        </Button>
      </div>
      {habit ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title="Delete this habit?"
          body={<>“{habit.title}” and its whole history will be removed. Archive it instead to keep the history.</>}
          onConfirm={() =>
            start(async () => {
              const r = await deleteHabit(habit.id);
              setConfirming(false);
              if (!r.ok) return setError(r.error);
              notify("Habit deleted");
              onClose();
            })
          }
        />
      ) : null}
    </form>
  );
}
