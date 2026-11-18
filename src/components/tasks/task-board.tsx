"use client";

import { CalendarDays, Plus, Repeat, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { Chip, ViewTabs } from "@/components/ui/tabs";
import { addDaysToKey, dateKey, describeDue, keyLabel } from "@/lib/time";
import type { Task } from "@/lib/types";
import { TaskRow } from "./task-row";

type View = "today" | "upcoming" | "all" | "overdue" | "done" | "projects";

export function TaskBoard({
  open,
  done,
  projects,
  checklist,
  nowMs,
  tz,
  initialView,
}: {
  open: Task[];
  done: Task[];
  projects: Array<{ id: string; title: string; status: string }>;
  checklist: Record<string, { done: number; total: number }>;
  nowMs: number;
  tz: string;
  initialView?: View;
}) {
  const { openCapture } = useShell();
  const [view, setView] = useState<View>(initialView ?? "today");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const todayKey = dateKey(nowMs, tz);
  const projectTitle = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects]);
  const categories = useMemo(() => [...new Set([...open, ...done].map((t) => t.category).filter(Boolean) as string[])].sort(), [open, done]);

  const info = (t: Task) => (t.due_at ? describeDue(t.due_at, t.due_has_time, nowMs, tz) : null);
  const isOverdue = (t: Task) => Boolean(info(t)?.overdue);
  const isToday = (t: Task) =>
    t.today_date === todayKey || t.planned_on === todayKey || (t.due_at ? dateKey(t.due_at, tz) === todayKey : false);

  const filter = (list: Task[]) => {
    const term = q.trim().toLowerCase();
    return list.filter(
      (t) =>
        (!term || t.title.toLowerCase().includes(term) || t.notes?.toLowerCase().includes(term)) &&
        (!category || t.category === category) &&
        (!priority || String(t.priority) === priority),
    );
  };

  const committed = open.filter((t) => t.status === "open");
  const lists: Record<View, Task[]> = {
    today: filter(committed.filter((t) => isToday(t) || isOverdue(t))),
    upcoming: filter(committed.filter((t) => !isOverdue(t) && !isToday(t) && (t.due_at || t.planned_on))),
    all: filter(open),
    overdue: filter(committed.filter(isOverdue)),
    done: filter(done),
    projects: filter(committed),
  };

  const meta = (t: Task) => {
    const parts = [];
    if (t.project_id && projectTitle.get(t.project_id)) parts.push(<span key="p">{projectTitle.get(t.project_id)}</span>);
    if (t.category) parts.push(<Chip key="c">{t.category}</Chip>);
    if (t.planned_on && t.planned_on !== todayKey)
      parts.push(
        <span key="pl" className="inline-flex items-center gap-1">
          <CalendarDays size={11} aria-hidden />
          do {keyLabel(t.planned_on)}
        </span>,
      );
    if (t.recurrence) parts.push(<Repeat key="r" size={11} aria-label="Repeats" />);
    const c = checklist[t.id];
    if (c) parts.push(<span key="ch" className="tnum">{c.done}/{c.total}</span>);
    if (t.status === "inbox") parts.push(<Chip key="i" tone="muted">Inbox</Chip>);
    return parts.length ? parts : null;
  };

  const rows = (items: Task[]) => (
    <ul className="flex flex-col divide-y divide-rule border-y border-rule">
      {items.map((t) => (
        <li key={t.id}>
          <TaskRow task={t} nowMs={nowMs} tz={tz} meta={meta(t)} />
        </li>
      ))}
    </ul>
  );

  const body = () => {
    const items = lists[view];
    if (view === "upcoming") {
      if (!items.length) return <EmptyState title="Nothing scheduled ahead" body="Tasks with a due date or a planned day show up here." />;
      const groups = new Map<string, Task[]>();
      for (const t of items) {
        const key = t.planned_on && (!t.due_at || t.planned_on < dateKey(t.due_at, tz)) ? t.planned_on : dateKey(t.due_at!, tz);
        groups.set(key, [...(groups.get(key) ?? []), t]);
      }
      return (
        <div className="flex flex-col gap-8">
          {[...groups.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, ts]) => (
              <section key={key} className="flex flex-col gap-1">
                <SectionHeader
                  title={key === addDaysToKey(todayKey, 1) ? "Tomorrow" : keyLabel(key, { weekday: "long", day: "numeric", month: "long" })}
                  count={ts.length}
                />
                {rows(ts)}
              </section>
            ))}
        </div>
      );
    }
    if (view === "projects") {
      const groups = new Map<string, Task[]>();
      for (const t of items) groups.set(t.project_id ?? "", [...(groups.get(t.project_id ?? "") ?? []), t]);
      if (!items.length) return <EmptyState title="No open tasks" />;
      return (
        <div className="flex flex-col gap-8">
          {[...groups.entries()]
            .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : (projectTitle.get(a) ?? "").localeCompare(projectTitle.get(b) ?? "")))
            .map(([pid, ts]) => (
              <section key={pid || "none"} className="flex flex-col gap-1">
                <SectionHeader title={pid ? (projectTitle.get(pid) ?? "Project") : "No project"} count={ts.length} />
                {rows(ts)}
              </section>
            ))}
        </div>
      );
    }
    if (!items.length) {
      const empty: Record<View, { title: string; body?: string }> = {
        today: { title: "Nothing due or planned today", body: "Pick today's three on Today, or give a task a “do it on” day." },
        upcoming: { title: "" },
        all: { title: "No tasks yet", body: "Capture one line and it becomes a task. Dates are picked up automatically." },
        overdue: { title: "Nothing overdue", body: "Good. Keep it that way by giving tasks realistic dates." },
        done: { title: "Nothing completed yet" },
        projects: { title: "" },
      };
      const e = empty[view];
      return (
        <EmptyState
          title={q || category || priority ? "No tasks match those filters" : e.title}
          body={q || category || priority ? undefined : e.body}
          action={
            view === "all" || view === "today" ? (
              <Button size="sm" onClick={() => openCapture()}>
                <Plus size={14} aria-hidden />
                Capture a task
              </Button>
            ) : undefined
          }
        />
      );
    }
    return rows(items);
  };

  return (
    <div className="flex flex-col gap-5">
      <ViewTabs
        label="Task views"
        value={view}
        onChange={setView}
        items={[
          { value: "today", label: "Today", count: lists.today.length },
          { value: "upcoming", label: "Upcoming", count: lists.upcoming.length },
          { value: "overdue", label: "Overdue", count: lists.overdue.length, tone: "danger" },
          { value: "all", label: "All", count: lists.all.length },
          { value: "projects", label: "By project" },
          { value: "done", label: "Completed" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            aria-label="Filter tasks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter"
            className="h-9 w-full rounded-sm border border-rule bg-surface pr-3 pl-8 text-small placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
        </div>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-auto text-small">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 w-auto text-small">
          <option value="">Any priority</option>
          <option value="1">High</option>
          <option value="2">Normal</option>
          <option value="3">Low</option>
        </Select>
      </div>
      {body()}
    </div>
  );
}
