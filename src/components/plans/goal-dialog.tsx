"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGoal, saveGoal } from "@/app/actions/plans";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import type { Goal } from "@/lib/types";

export const AREA_LABEL: Record<Goal["area"], string> = {
  personal: "Personal",
  professional: "Uni & work",
  financial: "Financial",
  fitness: "Fitness",
};
export const HORIZON_LABEL: Record<Goal["horizon"], string> = { short: "This term", medium: "This year", long: "Long term" };
export const GOAL_STATUS_LABEL: Record<Goal["status"], string> = { active: "Active", paused: "Paused", achieved: "Achieved", dropped: "Dropped" };

export function GoalDialog({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal }) {
  return (
    <Dialog open={open} onClose={onClose} title={goal ? "Edit goal" : "New goal"}>
      {open ? <GoalForm goal={goal} onClose={onClose} /> : null}
    </Dialog>
  );
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [target, setTarget] = useState(goal?.target ?? "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [horizon, setHorizon] = useState<Goal["horizon"]>(goal?.horizon ?? "medium");
  const [area, setArea] = useState<Goal["area"]>(goal?.area ?? "personal");
  const [status, setStatus] = useState<Goal["status"]>(goal?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await saveGoal({
            id: goal?.id,
            title,
            description: description || null,
            target: target || null,
            deadline: deadline || null,
            horizon,
            area,
            status,
            progress: goal?.progress ?? 0,
          });
          if (!r.ok) return setError(r.error);
          notify(goal ? "Goal saved" : "Goal created");
          onClose();
          if (!goal) router.push(`/goals/${r.data!.id}`);
        });
      }}
    >
      <Field label="Goal">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />}</Field>
      <Field label="What does done look like?" hint="A target you could check, e.g. “70%+ average across modules”.">
        {(id, d) => <Input id={id} aria-describedby={d} value={target} onChange={(e) => setTarget(e.target.value)} maxLength={300} />}
      </Field>
      <Field label="Why it matters">
        {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className="min-h-20" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Area">
          {(id) => (
            <Select id={id} value={area} onChange={(e) => setArea(e.target.value as Goal["area"])}>
              {Object.entries(AREA_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Deadline">{(id) => <Input id={id} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}</Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-small font-medium">Horizon</span>
        <Segmented
          label="Horizon"
          value={horizon}
          onChange={setHorizon}
          options={(Object.keys(HORIZON_LABEL) as Goal["horizon"][]).map((h) => ({ value: h, label: HORIZON_LABEL[h] }))}
        />
      </div>
      {goal ? (
        <Field label="Status">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
              {Object.entries(GOAL_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {goal ? (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          {goal ? "Save" : "Create goal"}
        </Button>
      </div>
      {goal ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title="Delete this goal?"
          body={<>“{goal.title}”, its milestones and updates will be removed. Linked projects and habits are kept, just unlinked.</>}
          onConfirm={() =>
            start(async () => {
              const r = await deleteGoal(goal.id);
              setConfirming(false);
              if (!r.ok) return setError(r.error);
              notify("Goal deleted");
              onClose();
              router.push("/goals");
            })
          }
        />
      ) : null}
    </form>
  );
}
