"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteTask, restoreTask, setTaskDone, updateTask } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { dateKey, formatTime, localToIso } from "@/lib/time";
import type { Task } from "@/lib/types";

export function TaskDialog({ task, onClose, tz }: { task: Task | null; onClose: () => void; tz: string }) {
  return (
    <Dialog open={Boolean(task)} onClose={onClose} title="Edit task">
      {task ? <TaskForm key={task.id} task={task} onClose={onClose} tz={tz} /> : null}
    </Dialog>
  );
}

function TaskForm({ task, onClose, tz }: { task: Task; onClose: () => void; tz: string }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [priority, setPriority] = useState<"1" | "2" | "3">(String(task.priority) as "1" | "2" | "3");
  const [date, setDate] = useState(task.due_at ? dateKey(task.due_at, tz) : "");
  const [time, setTime] = useState(task.due_at && task.due_has_time ? formatTime(task.due_at, tz) : "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const done = task.status === "done";

  function save() {
    setError(null);
    start(async () => {
      const res = await updateTask({
        id: task.id,
        title,
        notes: notes || null,
        priority: Number(priority) as 1 | 2 | 3,
        dueAt: date ? localToIso(date, time || "23:59", tz) : null,
        dueHasTime: Boolean(date && time),
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
      notify(done ? "Marked as not done" : "Done");
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
          <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="Details, links, the first concrete step…" />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due date">
          {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
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
        body={<>“{task.title}” will be removed. You can undo straight after.</>}
      />
    </form>
  );
}
