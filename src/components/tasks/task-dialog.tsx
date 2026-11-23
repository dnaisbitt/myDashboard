"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  createTask,
  deleteTask,
  getSubtasks,
  getTaskFormOptions,
  restoreTask,
  setTaskDone,
  updateTask,
} from "@/app/actions/tasks";
import { Button, IconButton } from "@/components/ui/button";
import { TaskCheck } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { describeRecurrence } from "@/lib/recurrence";
import { dateKey, formatTime, keyLabel, localToIso } from "@/lib/time";
import type { Recurrence, Task } from "@/lib/types";

export function TaskDialog({ task, onClose, tz }: { task: Task | null; onClose: () => void; tz: string }) {
  return (
    <Dialog open={Boolean(task)} onClose={onClose} title={task?.status === "inbox" ? "Decide on this" : "Edit task"}>
      {task ? <TaskForm key={task.id} task={task} onClose={onClose} tz={tz} /> : null}
    </Dialog>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Freq = "none" | Recurrence["freq"];

function TaskForm({ task, onClose, tz }: { task: Task; onClose: () => void; tz: string }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [priority, setPriority] = useState<"1" | "2" | "3">(String(task.priority) as "1" | "2" | "3");
  const [date, setDate] = useState(task.due_at ? dateKey(task.due_at, tz) : "");
  const [time, setTime] = useState(task.due_at && task.due_has_time ? formatTime(task.due_at, tz) : "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [category, setCategory] = useState(task.category ?? "");
  const [plannedOn, setPlannedOn] = useState(task.planned_on ?? "");
  const [estimate, setEstimate] = useState(task.estimate_minutes ? String(task.estimate_minutes) : "");
  const [freq, setFreq] = useState<Freq>(task.recurrence?.freq ?? "none");
  const [interval, setInterval] = useState(task.recurrence?.interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(task.recurrence?.weekdays ?? []);
  const [options, setOptions] = useState<{ projects: Array<{ id: string; title: string }>; categories: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const done = task.status === "done";
  const isSubtask = Boolean(task.parent_id);

  useEffect(() => {
    let live = true;
    getTaskFormOptions().then((r) => live && r.ok && setOptions(r.data!));
    return () => {
      live = false;
    };
  }, []);

  const recurrence: Recurrence | null =
    freq === "none" ? null : { freq, interval, ...(freq === "weekly" && weekdays.length ? { weekdays: [...weekdays].sort() } : {}) };

  function save() {
    setError(null);
    if (recurrence && !date) return setError("A repeating task needs a first due date.");
    start(async () => {
      const res = await updateTask({
        id: task.id,
        title,
        notes: notes || null,
        priority: Number(priority) as 1 | 2 | 3,
        dueAt: date ? localToIso(date, time || "23:59", tz) : null,
        dueHasTime: Boolean(date && time),
        category: category.trim() || null,
        projectId: projectId || null,
        recurrence,
        plannedOn: plannedOn || null,
        estimateMinutes: estimate ? Number(estimate) : null,
      });
      if (!res.ok) return setError(res.error);
      notify("Saved");
      onClose();
    });
  }

  function remove() {
    start(async () => {
      const res = await deleteTask(task.id);
      setConfirming(false);
      if (!res.ok) return setError(res.error);
      onClose();
      const deleted = res.data!.task;
      notify("Task deleted", {
        action: {
          label: "Undo",
          run: async () => {
            const r = await restoreTask(deleted);
            notify(r.ok ? "Restored" : r.error, { tone: r.ok ? "ok" : "error" });
          },
        },
      });
    });
  }

  function toggleDone() {
    start(async () => {
      const res = await setTaskDone(task.id, !done);
      if (!res.ok) return setError(res.error);
      notify(done ? "Marked as not done" : res.data?.nextDue ? `Done. Next one due ${keyLabel(res.data.nextDue)}` : "Done");
      onClose();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Title">
        {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />}
      </Field>
      <Field label="Notes">
        {(id) => (
          <Textarea
            id={id}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
            className="min-h-20"
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Time" hint={date && !time ? "Optional" : undefined}>
          {(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />}
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-small font-medium">Priority</span>
        <Segmented
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={[
            { value: "1", label: "High" },
            { value: "2", label: "Normal" },
            { value: "3", label: "Low" },
          ]}
        />
      </div>

      {!isSubtask ? (
        <details className="group rounded-md border border-rule" open={Boolean(task.project_id || task.category || task.recurrence || task.planned_on || task.estimate_minutes)}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-small font-medium select-none">
            More: project, repeat, plan
            <span className="text-ink-3 transition-transform group-open:rotate-45">
              <Plus size={14} aria-hidden />
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-rule px-3 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project">
                {(id) => (
                  <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">None</option>
                    {options?.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Category">
                {(id) => (
                  <>
                    <Input id={id} list={`${id}-list`} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
                    <datalist id={`${id}-list`}>
                      {options?.categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </>
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Do it on" hint="The day you'll work on it">
                {(id, d) => <Input id={id} aria-describedby={d} type="date" value={plannedOn} onChange={(e) => setPlannedOn(e.target.value)} />}
              </Field>
              <Field label="Estimate">
                {(id) => (
                  <Select id={id} value={estimate} onChange={(e) => setEstimate(e.target.value)}>
                    <option value="">Not sure</option>
                    {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                      <option key={m} value={m}>
                        {m < 60 ? `${m} min` : `${m / 60}h`}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <Field label="Repeat">
                  {(id) => (
                    <Select id={id} value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
                      <option value="none">Doesn&apos;t repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </Select>
                  )}
                </Field>
                {freq !== "none" ? (
                  <Field label="Every">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={1}
                        max={12}
                        value={interval}
                        onChange={(e) => setInterval(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                        className="w-20"
                      />
                    )}
                  </Field>
                ) : null}
              </div>
              {freq === "weekly" ? (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Repeat on">
                  {WEEKDAYS.map((w, i) => {
                    const d = i + 1;
                    const on = weekdays.includes(d);
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                        className={cn(
                          "h-8 w-11 rounded-sm border text-small transition-colors",
                          on ? "border-ink bg-ink text-canvas" : "border-rule text-ink-2 hover:border-rule-strong",
                        )}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {recurrence ? (
                <p className="text-small text-ink-2">{describeRecurrence(recurrence)}. Completing it schedules the next one.</p>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}

      {!isSubtask ? <Checklist parentId={task.id} /> : null}

      {error ? <p className="text-small text-danger">{error}</p> : null}

      <div className="flex items-center gap-2 border-t border-rule pt-4">
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label="Delete task" className="px-2 text-danger hover:text-danger">
          <Trash2 size={15} aria-hidden />
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleDone} disabled={pending}>
          {done ? "Mark not done" : "Mark done"}
        </Button>
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
        pending={pending}
        title="Delete this task?"
        body={<>“{task.title}” and its checklist will be removed. You can undo the task straight after.</>}
      />
    </form>
  );
}

/** Subtasks as a checklist. Changes save immediately. */
function Checklist({ parentId }: { parentId: string }) {
  const [items, setItems] = useState<Task[] | null>(null);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const { notify } = useToast();

  useEffect(() => {
    let live = true;
    getSubtasks(parentId).then((r) => live && setItems(r.ok ? r.data! : []));
    return () => {
      live = false;
    };
  }, [parentId]);

  const reload = async () => {
    const r = await getSubtasks(parentId);
    if (r.ok) setItems(r.data!);
  };

  const done = items?.filter((i) => i.status === "done").length ?? 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-small font-medium">Checklist</span>
        {items?.length ? <span className="tnum text-micro text-ink-3">{done}/{items.length}</span> : null}
      </div>
      <ul className="flex flex-col">
        {items?.map((it) => (
          <li key={it.id} className="group flex min-h-9 items-center gap-3">
            <TaskCheck
              checked={it.status === "done"}
              label={`Complete “${it.title}”`}
              onChange={(next) =>
                start(async () => {
                  setItems((xs) => xs?.map((x) => (x.id === it.id ? { ...x, status: next ? "done" : "open" } : x)) ?? null);
                  const r = await setTaskDone(it.id, next);
                  if (!r.ok) notify(r.error, { tone: "error" });
                  await reload();
                })
              }
            />
            <span className={cn("flex-1 text-small", it.status === "done" && "text-ink-3 line-through")}>{it.title}</span>
            <IconButton
              label={`Remove “${it.title}”`}
              size="sm"
              className="opacity-60 group-hover:opacity-100"
              onClick={() =>
                start(async () => {
                  const r = await deleteTask(it.id);
                  if (!r.ok) notify(r.error, { tone: "error" });
                  await reload();
                })
              }
            >
              <X size={13} aria-hidden />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <label htmlFor={`sub-${parentId}`} className="sr-only">
          Add a checklist item
        </label>
        <input
          id={`sub-${parentId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const title = value.trim();
            if (!title) return;
            start(async () => {
              const r = await createTask({ title, parentId });
              if (!r.ok) return notify(r.error, { tone: "error" });
              setValue("");
              await reload();
            });
          }}
          maxLength={300}
          placeholder="Add a step and press Enter"
          className="h-9 flex-1 border-b border-rule bg-transparent text-small placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        {pending ? <span className="text-micro text-ink-3">Saving…</span> : null}
      </div>
    </div>
  );
}
