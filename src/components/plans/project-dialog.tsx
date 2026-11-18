"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProject, saveProject } from "@/app/actions/plans";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import type { Project } from "@/lib/types";

export const PROJECT_STATUS_LABEL: Record<Project["status"], string> = {
  exploring: "Exploring",
  active: "Active",
  paused: "Paused",
  done: "Done",
  dropped: "Dropped",
};

export function ProjectDialog({
  open,
  onClose,
  project,
  goals,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project;
  goals: Array<{ id: string; title: string }>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? "Edit project" : "New project"}>
      {open ? <ProjectForm project={project} goals={goals} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ProjectForm({ project, goals, onClose }: { project?: Project; goals: Array<{ id: string; title: string }>; onClose: () => void }) {
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [deadline, setDeadline] = useState(project?.deadline ?? "");
  const [priority, setPriority] = useState<"1" | "2" | "3">(String(project?.priority ?? 2) as "1" | "2" | "3");
  const [status, setStatus] = useState<Project["status"]>(project?.status ?? "active");
  const [goalId, setGoalId] = useState(project?.goal_id ?? "");
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
          const r = await saveProject({
            id: project?.id,
            title,
            description: description || null,
            deadline: deadline || null,
            priority: Number(priority) as 1 | 2 | 3,
            status,
            goalId: goalId || null,
          });
          if (!r.ok) return setError(r.error);
          notify(project ? "Project saved" : "Project created");
          onClose();
          if (!project) router.push(`/projects/${r.data!.id}`);
        });
      }}
    >
      <Field label="Name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />}</Field>
      <Field label="What is it for?">
        {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className="min-h-20" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}>
              {Object.entries(PROJECT_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Deadline">{(id) => <Input id={id} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}</Field>
      </div>
      <Field label="Moves this goal" hint={goals.length ? undefined : "Create goals in Goals & Habits to link them."}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">No goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
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
        {project ? (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          {project ? "Save" : "Create project"}
        </Button>
      </div>
      {project ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title="Delete this project?"
          body={<>“{project.title}” and its milestones will be removed. Its tasks are kept, just unlinked.</>}
          onConfirm={() =>
            start(async () => {
              const r = await deleteProject(project.id);
              setConfirming(false);
              if (!r.ok) return setError(r.error);
              notify("Project deleted");
              onClose();
              router.push("/projects");
            })
          }
        />
      ) : null}
    </form>
  );
}
