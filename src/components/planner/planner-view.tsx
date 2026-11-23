"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { planTask, rescheduleTasks } from "@/app/actions/tasks";
import { useShell } from "@/components/shell/shell-context";
import { EventDialog, SessionDialog, type EventDraft } from "@/components/today/event-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { blockMinutes, dayLoad, freeGaps, type Block, type DayLoad } from "@/lib/schedule";
import {
  addDaysToKey,
  addMonthsToKey,
  dateKey,
  describeDue,
  durationLabel,
  formatTime,
  isoWeekday,
  keyLabel,
  localMinutes,
  minutesToTime,
  monthStartKey,
  weekStartKey,
} from "@/lib/time";
import { EVENT_KIND_LABEL, SESSION_KIND_LABEL, type Task } from "@/lib/types";

export type PlannerViewName = "day" | "week" | "month";

const DAY_START = 7 * 60;
const DAY_END = 23 * 60;
const HOUR_PX = 44;

function label(kind: string) {
  return (EVENT_KIND_LABEL as Record<string, string>)[kind] ?? (SESSION_KIND_LABEL as Record<string, string>)[kind] ?? kind;
}

function loadTone(l: DayLoad["level"]) {
  return l === "overloaded" ? "bg-danger" : l === "heavy" ? "bg-ink" : l === "steady" ? "bg-ink-3" : "bg-rule-strong";
}

export function PlannerView({
  view,
  anchor,
  todayKey,
  blocks,
  tasks,
  overdue,
  tz,
  nowMs,
}: {
  view: PlannerViewName;
  anchor: string;
  todayKey: string;
  blocks: Block[];
  tasks: Task[];
  overdue: Task[];
  tz: string;
  nowMs: number;
}) {
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [session, setSession] = useState<Block | null>(null);
  const openBlock = (b: Block) => (b.source === "session" ? setSession(b) : setDraft({ event: b.event, dayKey: b.dateKey }));

  const byDay = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const b of blocks) m.set(b.dateKey, [...(m.get(b.dateKey) ?? []), b]);
    return m;
  }, [blocks]);
  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = t.planned_on ?? (t.due_at ? dateKey(t.due_at, tz) : null);
      if (k) m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [tasks, tz]);

  const loadFor = (k: string) =>
    dayLoad(byDay.get(k) ?? [], (tasksByDay.get(k) ?? []).filter((t) => t.planned_on === k).reduce((s, t) => s + (t.estimate_minutes ?? 0), 0));

  const step = view === "day" ? (n: number) => addDaysToKey(anchor, n) : view === "week" ? (n: number) => addDaysToKey(anchor, 7 * n) : (n: number) => addMonthsToKey(anchor, n);
  const href = (v: PlannerViewName, d: string) => `/planner?view=${v}&date=${d}`;

  const title =
    view === "day"
      ? keyLabel(anchor, { weekday: "long", day: "numeric", month: "long" })
      : view === "week"
        ? (() => {
            const s = weekStartKey(anchor);
            const e = addDaysToKey(s, 6);
            return `${keyLabel(s, { day: "numeric", month: s.slice(5, 7) === e.slice(5, 7) ? undefined : "short" })} – ${keyLabel(e, { day: "numeric", month: "long", year: "numeric" })}`;
          })()
        : keyLabel(anchor, { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center">
          <Link href={href(view, step(-1))} aria-label="Previous" className="grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-sunken hover:text-ink">
            <ChevronLeft size={18} aria-hidden />
          </Link>
          <Link href={href(view, step(1))} aria-label="Next" className="grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-sunken hover:text-ink">
            <ChevronRight size={18} aria-hidden />
          </Link>
        </div>
        <h2 className="font-display text-title">{title}</h2>
        {anchor !== todayKey ? (
          <Link href={href(view, todayKey)} className="text-small text-ink-2 underline underline-offset-4 hover:text-ink">
            Today
          </Link>
        ) : null}
        <div className="ml-auto inline-flex rounded-sm border border-rule bg-sunken/50 p-0.5" role="group" aria-label="View">
          {(["day", "week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href(v, anchor)}
              aria-current={v === view ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-[4px] px-3 text-small capitalize",
                v === view ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--rule)]" : "text-ink-2 hover:text-ink",
              )}
            >
              {v}
            </Link>
          ))}
        </div>
        <Button size="sm" variant="primary" onClick={() => setDraft({ dayKey: view === "day" ? anchor : todayKey })}>
          <Plus size={14} aria-hidden />
          Block
        </Button>
      </div>

      {view === "week" ? (
        <WeekGrid
          start={weekStartKey(anchor)}
          todayKey={todayKey}
          byDay={byDay}
          tasksByDay={tasksByDay}
          loadFor={loadFor}
          tz={tz}
          nowMs={nowMs}
          onBlock={openBlock}
          onSlot={(k, mins) => setDraft({ dayKey: k, start: minutesToTime(mins), end: minutesToTime(Math.min(mins + 60, DAY_END)) })}
        />
      ) : view === "month" ? (
        <MonthGrid anchor={anchor} todayKey={todayKey} byDay={byDay} tasksByDay={tasksByDay} loadFor={loadFor} />
      ) : (
        <DayAgenda
          dayKey={anchor}
          todayKey={todayKey}
          blocks={byDay.get(anchor) ?? []}
          tasks={tasksByDay.get(anchor) ?? []}
          load={loadFor(anchor)}
          tz={tz}
          nowMs={nowMs}
          onBlock={openBlock}
          onGap={(from, to) => setDraft({ dayKey: anchor, start: minutesToTime(from), end: minutesToTime(Math.min(from + 30, to)), kind: "focus" })}
        />
      )}

      {overdue.length ? <Unfinished tasks={overdue} todayKey={todayKey} tz={tz} nowMs={nowMs} /> : null}

      <EventDialog draft={draft} onClose={() => setDraft(null)} tz={tz} />
      <SessionDialog block={session} onClose={() => setSession(null)} tz={tz} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Side-by-side lanes for overlapping blocks. */
function lanes(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const out: Array<{ b: Block; lane: number; of: number }> = [];
  let cluster: Array<{ b: Block; lane: number }> = [];
  let clusterEnd = "";
  const flush = () => {
    const of = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => out.push({ ...c, of }));
    cluster = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.startsAt >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.b.endsAt > b.startsAt).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ b, lane });
    clusterEnd = clusterEnd && clusterEnd > b.endsAt ? clusterEnd : b.endsAt;
  }
  if (cluster.length) flush();
  return out;
}

function WeekGrid({
  start,
  todayKey,
  byDay,
  tasksByDay,
  loadFor,
  tz,
  nowMs,
  onBlock,
  onSlot,
}: {
  start: string;
  todayKey: string;
  byDay: Map<string, Block[]>;
  tasksByDay: Map<string, Task[]>;
  loadFor: (k: string) => DayLoad;
  tz: string;
  nowMs: number;
  onBlock: (b: Block) => void;
  onSlot: (k: string, mins: number) => void;
}) {
  const { openTask } = useShell();
  const { notify } = useToast();
  const [, startT] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);
  const nowMin = localMinutes(nowMs, tz);

  const drop = (k: string, id: string) =>
    startT(async () => {
      const r = await planTask(id, k);
      notify(r.ok ? `Planned for ${keyLabel(k)}` : r.error, { tone: r.ok ? "ok" : "error" });
    });

  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div className="min-w-[760px]">
        {/* Day headers: load + tasks (drop target for planning) */}
        <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-rule">
          <div />
          {days.map((k) => {
            const load = loadFor(k);
            const ts = tasksByDay.get(k) ?? [];
            const committed = load.committedMinutes + load.focusMinutes;
            return (
              <div
                key={k}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(k);
                }}
                onDragLeave={() => setDragOver((d) => (d === k ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/task-id");
                  if (id) drop(k, id);
                }}
                className={cn("flex min-h-24 flex-col gap-1 border-l border-rule px-1.5 pt-1 pb-2 transition-colors", dragOver === k && "bg-sunken")}
              >
                <Link href={`/planner?view=day&date=${k}`} className="flex items-baseline gap-1.5 rounded-sm px-1 hover:bg-sunken/60">
                  <span className="text-small text-ink-2">{keyLabel(k, { weekday: "short" })}</span>
                  <span className={cn("text-title leading-tight", k === todayKey && "font-semibold")}>{Number(k.slice(8))}</span>
                </Link>
                <div className="flex items-center gap-1.5 px-1" title={load.reasons.join(", ") || load.level}>
                  <span className={cn("size-1.5 rounded-full", loadTone(load.level))} aria-hidden />
                  <span className="text-micro text-ink-2">
                    {committed ? durationLabel(committed) : "Free"}
                    {load.level === "overloaded" ? " · too much" : load.level === "heavy" ? " · heavy" : ""}
                  </span>
                </div>
                {ts.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                    onClick={() => openTask(t)}
                    title={`${t.title}${t.planned_on === k ? " (planned)" : " (due)"}. Drag to another day to plan it.`}
                    className={cn(
                      "cursor-grab truncate rounded-[4px] px-1.5 py-0.5 text-left text-micro active:cursor-grabbing",
                      t.planned_on === k ? "bg-sunken text-ink" : "border border-dashed border-rule-strong text-ink-2",
                    )}
                  >
                    {t.title}
                  </button>
                ))}
                {ts.length > 3 ? (
                  <Link href={`/planner?view=day&date=${k}`} className="px-1 text-micro text-ink-3 hover:text-ink">
                    +{ts.length - 3} more
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative grid grid-cols-[48px_repeat(7,minmax(0,1fr))]" style={{ height: hours.length * HOUR_PX }}>
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-micro text-ink-3" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {days.map((k) => (
            <div
              key={k}
              className="relative border-l border-rule"
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const y = e.nativeEvent.offsetY;
                const mins = DAY_START + Math.floor((y / HOUR_PX) * 2) * 30;
                onSlot(k, Math.min(mins, DAY_END - 30));
              }}
            >
              {hours.map((h, i) => (
                <div key={h} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-rule/60" style={{ top: i * HOUR_PX }} />
              ))}
              {k === todayKey && nowMin >= DAY_START && nowMin <= DAY_END ? (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 h-px bg-ink" style={{ top: ((nowMin - DAY_START) / 60) * HOUR_PX }}>
                  <span className="absolute -top-[3px] -left-[3px] size-[7px] rounded-full bg-ink" />
                </div>
              ) : null}
              {lanes(byDay.get(k) ?? []).map(({ b, lane, of }) => {
                const s = Math.max(DAY_START, localMinutes(b.startsAt, tz));
                const e = Math.min(DAY_END, localMinutes(b.endsAt, tz) || DAY_END);
                if (e <= DAY_START || s >= DAY_END) return null;
                const top = ((s - DAY_START) / 60) * HOUR_PX;
                const height = Math.max(18, ((e - s) / 60) * HOUR_PX - 2);
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onBlock(b)}
                    className={cn(
                      "absolute overflow-hidden rounded-[5px] border px-1.5 py-1 text-left text-micro transition-colors",
                      b.cancelled
                        ? "border-dashed border-rule-strong bg-transparent text-ink-3 line-through"
                        : b.kind === "focus"
                          ? "border-ink/30 bg-surface hover:border-ink/60"
                          : b.source === "session"
                            ? "border-rule bg-sunken hover:border-rule-strong"
                            : "border-rule bg-surface hover:border-rule-strong",
                    )}
                    style={{ top, height, left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 4px)` }}
                  >
                    <span className="block truncate font-medium text-ink">{b.title}</span>
                    {height > 30 ? (
                      <span className="block truncate text-ink-2">
                        {formatTime(b.startsAt, tz)} · {label(b.kind)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-3 text-micro text-ink-3">Click an empty slot to add a block. Drag a task onto a day to plan it.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MonthGrid({
  anchor,
  todayKey,
  byDay,
  tasksByDay,
  loadFor,
}: {
  anchor: string;
  todayKey: string;
  byDay: Map<string, Block[]>;
  tasksByDay: Map<string, Task[]>;
  loadFor: (k: string) => DayLoad;
}) {
  const first = monthStartKey(anchor);
  const gridStart = weekStartKey(first);
  const month = first.slice(0, 7);
  const cells = Array.from({ length: 42 }, (_, i) => addDaysToKey(gridStart, i));
  const weeks = cells[35].slice(0, 7) === month ? 6 : 5;

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-rule pb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="px-2 text-micro text-ink-2">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.slice(0, weeks * 7).map((k) => {
          const bs = (byDay.get(k) ?? []).filter((b) => !b.cancelled);
          const ts = tasksByDay.get(k) ?? [];
          const load = loadFor(k);
          const inMonth = k.slice(0, 7) === month;
          return (
            <Link
              key={k}
              href={`/planner?view=day&date=${k}`}
              className={cn(
                "flex min-h-24 flex-col gap-1 border-r border-b border-rule p-1.5 transition-colors hover:bg-sunken/50 sm:min-h-28",
                isoWeekday(k) === 1 && "border-l",
                !inMonth && "text-ink-3",
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn("text-small", k === todayKey && "grid size-6 place-items-center rounded-full bg-ink font-medium text-canvas")}>
                  {Number(k.slice(8))}
                </span>
                {bs.length ? <span className={cn("size-1.5 rounded-full", loadTone(load.level))} aria-label={`Load: ${load.level}`} /> : null}
              </span>
              {bs.slice(0, 2).map((b) => (
                <span key={b.key} className="hidden truncate text-micro text-ink-2 sm:block">
                  {b.title}
                </span>
              ))}
              {bs.length > 2 ? <span className="hidden text-micro text-ink-3 sm:block">+{bs.length - 2}</span> : null}
              {ts.length ? <span className="mt-auto text-micro text-ink-2">{ts.length} task{ts.length === 1 ? "" : "s"}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DayAgenda({
  dayKey,
  todayKey,
  blocks,
  tasks,
  load,
  tz,
  nowMs,
  onBlock,
  onGap,
}: {
  dayKey: string;
  todayKey: string;
  blocks: Block[];
  tasks: Task[];
  load: DayLoad;
  tz: string;
  nowMs: number;
  onBlock: (b: Block) => void;
  onGap: (from: number, to: number) => void;
}) {
  const { openTask } = useShell();
  const live = blocks.filter((b) => !b.cancelled);
  const from = dayKey === todayKey ? Math.max(8 * 60, Math.ceil(localMinutes(nowMs, tz) / 15) * 15) : 8 * 60;
  const gaps = freeGaps(
    live.map((b) => ({ start: localMinutes(b.startsAt, tz), end: localMinutes(b.endsAt, tz) || 24 * 60 })),
    from,
    22 * 60,
    45,
  );
  type Row = { at: number; node: React.ReactNode };
  const rows: Row[] = [
    ...blocks.map((b) => ({
      at: localMinutes(b.startsAt, tz),
      node: (
        <li key={b.key}>
          <button
            type="button"
            onClick={() => onBlock(b)}
            className={cn("flex w-full items-start gap-4 rounded-sm py-2.5 text-left hover:bg-sunken/50", b.cancelled && "text-ink-3")}
          >
            <span className="w-[92px] shrink-0 pt-px text-small text-ink-2">
              {formatTime(b.startsAt, tz)}–{formatTime(b.endsAt, tz)}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-medium", b.cancelled && "font-normal line-through")}>{b.title}</span>
              <span className="text-small text-ink-2">
                {b.cancelled ? "Cancelled this week" : label(b.kind)}
                {b.location ? ` · ${b.location}` : ""}
                {b.event?.outcome ? ` · ${b.event.outcome === "stayed" ? "stayed on it" : b.event.outcome === "partly" ? "partly" : "drifted"}` : ""}
              </span>
            </span>
            <span className="text-small text-ink-3">{durationLabel(blockMinutes(b))}</span>
          </button>
        </li>
      ),
    })),
    ...gaps.map((g) => {
      const drift = g.from < 16 * 60 && g.to > 10 * 60;
      return {
        at: g.from,
        node: (
          <li key={`gap-${g.from}`} className="flex items-center gap-4 py-1">
            <span className="w-[92px] shrink-0 text-small text-ink-3">{minutesToTime(g.from)}</span>
            <button
              type="button"
              onClick={() => onGap(g.from, g.to)}
              className="flex-1 rounded-sm border border-dashed border-rule px-3 py-1.5 text-left text-small text-ink-2 hover:border-rule-strong hover:text-ink"
            >
              {durationLabel(g.to - g.from)} open
              {drift ? " · drift window, add a 30-minute block with one small task" : g.from >= 18 * 60 ? " · your evening peak, good for hard coursework" : ""}
            </button>
          </li>
        ),
      };
    }),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-2">
        <SectionHeader title="Schedule" count={live.length ? `${live.length} block${live.length === 1 ? "" : "s"}` : undefined} />
        {load.level === "overloaded" || load.level === "heavy" ? (
          <p className={cn("rounded-md px-3.5 py-2.5 text-small", load.level === "overloaded" ? "bg-danger/10 text-danger" : "bg-sunken text-ink")}>
            {load.level === "overloaded" ? "This day is overloaded: " : "Heavy day: "}
            {load.reasons.join(", ")}. A realistic day beats a packed one. Move something.
          </p>
        ) : null}
        {rows.length ? <ol className="flex flex-col">{rows.map((r) => r.node)}</ol> : <EmptyState title="Nothing scheduled" body="Click the + Block button, or an open gap, to plan this day." />}
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeader title="Tasks for this day" count={tasks.length || undefined} />
        {tasks.length ? (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {tasks.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => openTask(t)} className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-sunken/40">
                  <span className="flex-1">{t.title}</span>
                  <span className="text-small text-ink-2">
                    {t.planned_on === dayKey ? "planned" : t.due_at ? describeDue(t.due_at, t.due_has_time, nowMs, tz).label : ""}
                    {t.estimate_minutes ? ` · ${durationLabel(t.estimate_minutes)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-2">Nothing due or planned. In week view you can drag tasks onto a day.</p>
        )}
        <p className="mt-2 text-small text-ink-2">
          Committed {durationLabel(load.committedMinutes)} · focus {durationLabel(load.focusMinutes)}
          {load.plannedTaskMinutes ? ` · tasks ${durationLabel(load.plannedTaskMinutes)}` : ""}
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Unfinished({ tasks, todayKey, tz, nowMs }: { tasks: Task[]; todayKey: string; tz: string; nowMs: number }) {
  const { openTask } = useShell();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const move = (ids: string[], k: string) =>
    start(async () => {
      const r = await rescheduleTasks(ids, k);
      notify(r.ok ? `Moved ${r.data!.moved} to ${keyLabel(k)}` : r.error, { tone: r.ok ? "ok" : "error" });
    });
  const tomorrow = addDaysToKey(todayKey, 1);

  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-6">
      <SectionHeader
        title="Unfinished, needs a new day"
        count={tasks.length}
        action={
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => move(tasks.map((t) => t.id), tomorrow)}>
            All to tomorrow
          </Button>
        }
      />
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {tasks.map((t) => (
          <li key={t.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <button type="button" onClick={() => openTask(t)} className="min-w-0 flex-1 truncate text-left">
              {t.title}
            </button>
            <span className="text-small font-medium text-danger">{describeDue(t.due_at!, t.due_has_time, nowMs, tz).label}</span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2" disabled={pending} onClick={() => move([t.id], todayKey)}>
                Today
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" disabled={pending} onClick={() => move([t.id], tomorrow)}>
                Tomorrow
              </Button>
              <label className="sr-only" htmlFor={`pick-${t.id}`}>
                Pick a day for {t.title}
              </label>
              <input
                id={`pick-${t.id}`}
                type="date"
                min={todayKey}
                onChange={(e) => e.target.value && move([t.id], e.target.value)}
                className="h-7 w-[118px] rounded-sm border border-rule bg-surface px-1.5 text-micro text-ink-2"
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

