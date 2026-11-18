"use client";

import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { durationLabel, formatTime, localMinutes } from "@/lib/time";
import { EVENT_KIND_LABEL, type CalendarEvent } from "@/lib/types";
import { EventDialog, type EventDraft } from "./event-dialog";
import { useMinuteClock } from "./today-header";

const DRIFT_START = 10 * 60;
const DRIFT_END = 16 * 60;
const MIN_GAP = 45;

type Row =
  | { type: "event"; event: CalendarEvent; state: "past" | "now" | "next" | "later" }
  | { type: "now"; at: number }
  | { type: "gap"; from: number; to: number; drift: boolean };

function hhmm(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Turns today's blocks into an agenda with a "now" line and the open gaps worth using. */
export function buildRows(events: CalendarEvent[], nowMs: number, tz: string): Row[] {
  const nowMin = localMinutes(nowMs, tz);
  const rows: Row[] = [];
  let nowPlaced = false;
  let nextAssigned = false;
  let cursor = nowMin; // gaps only matter from now on

  for (const event of events) {
    const s = new Date(event.starts_at).getTime();
    const e = new Date(event.ends_at).getTime();
    const startMin = localMinutes(event.starts_at, tz);
    let state: "past" | "now" | "next" | "later";
    if (e <= nowMs) state = "past";
    else if (s <= nowMs) state = "now";
    else if (!nextAssigned) state = "next";
    else state = "later";

    if (!nowPlaced && (state === "next" || state === "later")) {
      rows.push({ type: "now", at: nowMin });
      nowPlaced = true;
    }
    if (state === "now") nowPlaced = true;

    if (state === "next" || state === "later") {
      if (startMin - cursor >= MIN_GAP) {
        rows.push({
          type: "gap",
          from: cursor,
          to: startMin,
          drift: cursor < DRIFT_END && startMin > DRIFT_START,
        });
      }
    }
    if (state === "next") nextAssigned = true;
    rows.push({ type: "event", event, state });
    if (state !== "past") {
      const endMin = localMinutes(event.ends_at, tz);
      cursor = Math.max(cursor, endMin < startMin ? 24 * 60 : endMin);
    }
  }
  if (!nowPlaced && events.length) rows.push({ type: "now", at: nowMin });
  return rows;
}

export function Schedule({
  events,
  nowMs: initialNow,
  tz,
  todayKey,
  marked,
}: {
  events: CalendarEvent[];
  nowMs: number;
  tz: string;
  todayKey: string;
  /** Whether the highlighter is spent on the current/next block. */
  marked: boolean;
}) {
  const nowMs = useMinuteClock(initialNow);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const rows = buildRows(events, nowMs, tz);
  const hasNow = rows.some((r) => r.type === "event" && r.state === "now");
  const remaining = events.filter((e) => new Date(e.ends_at).getTime() > nowMs).length;

  return (
    <section aria-labelledby="schedule-title" className="flex flex-col gap-2">
      <SectionHeader
        id="schedule-title"
        title="Schedule"
        count={events.length ? `${remaining} left` : undefined}
        action={
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDraft({ dayKey: todayKey })}>
            <Plus size={14} aria-hidden />
            Block
          </Button>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          title="Nothing scheduled today"
          body="Your weekly lecture timetable is coming in Phase 4. For now you can add one-off blocks: a 60-minute focus block, training, an appointment."
          action={
            <Button size="sm" onClick={() => setDraft({ dayKey: todayKey })}>
              <Plus size={14} aria-hidden />
              Add a block
            </Button>
          }
        />
      ) : (
        <ol className="flex flex-col">
          {rows.map((row, i) => {
            if (row.type === "now") {
              return (
                <li key={`now-${i}`} className="flex items-center gap-3 py-1.5" aria-label={`Now, ${hhmm(row.at)}`}>
                  <span className="w-[92px] shrink-0 text-small font-medium">{hhmm(row.at)}</span>
                  <span className="size-1.5 rounded-full bg-ink" aria-hidden />
                  <span className="h-px flex-1 bg-ink/70" aria-hidden />
                </li>
              );
            }
            if (row.type === "gap") {
              const mins = row.to - row.from;
              return (
                <li key={`gap-${i}`} className="flex items-center gap-3 py-1">
                  <span className="w-[92px] shrink-0 text-small text-ink-3">{hhmm(row.from)}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        dayKey: todayKey,
                        start: hhmm(Math.ceil(row.from / 15) * 15),
                        end: hhmm(Math.min(Math.ceil(row.from / 15) * 15 + 60, row.to)),
                      })
                    }
                    className="flex-1 rounded-sm border border-dashed border-rule px-3 py-1.5 text-left text-small text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
                  >
                    {durationLabel(mins)} open
                    {row.drift ? " · drift window, give it one small, specific task" : ""}
                  </button>
                </li>
              );
            }
            const { event, state } = row;
            const highlight = marked && (state === "now" || (state === "next" && !hasNow));
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => setDraft({ event, dayKey: todayKey })}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-sm py-2 text-left transition-colors hover:bg-sunken/60",
                    state === "past" && "text-ink-3",
                  )}
                >
                  <span className="relative isolate w-[92px] shrink-0 pt-px text-small">
                    {highlight ? (
                      <span aria-hidden className="absolute -inset-x-1.5 -inset-y-0.5 -z-10 origin-left animate-sweep rounded-[3px] bg-mark" />
                    ) : null}
                    <span className={cn(highlight ? "font-medium text-mark-ink" : state === "past" ? "" : "text-ink-2")}>
                      {formatTime(event.starts_at, tz)}–{formatTime(event.ends_at, tz)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", state !== "past" && "font-medium")}>{event.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-small text-ink-2">
                      <span>{state === "now" ? "Now" : EVENT_KIND_LABEL[event.kind]}</span>
                      {event.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} aria-hidden />
                          {event.location}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <EventDialog draft={draft} onClose={() => setDraft(null)} tz={tz} />
    </section>
  );
}
