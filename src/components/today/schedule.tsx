"use client";

import { MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setFocusOutcome } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Block } from "@/lib/schedule";
import { durationLabel, formatTime, localMinutes } from "@/lib/time";
import { EVENT_KIND_LABEL, PLACE_LABEL, SESSION_KIND_LABEL, type FocusOutcome } from "@/lib/types";
import { EventDialog, SessionDialog, type EventDraft } from "./event-dialog";
import { useMinuteClock } from "./today-header";

const DRIFT_START = 10 * 60;
const DRIFT_END = 16 * 60;
const MIN_GAP = 45;

type Row =
  | { type: "block"; block: Block; state: "past" | "now" | "next" | "later" }
  | { type: "now"; at: number }
  | { type: "gap"; from: number; to: number; drift: boolean };

function hhmm(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

const kindLabel = (k: string) =>
  (EVENT_KIND_LABEL as Record<string, string>)[k] ?? (SESSION_KIND_LABEL as Record<string, string>)[k] ?? k;

/** Today's blocks as an agenda with a "now" line and the open gaps worth using. */
export function buildRows(blocks: Block[], nowMs: number, tz: string): Row[] {
  const nowMin = localMinutes(nowMs, tz);
  const rows: Row[] = [];
  let nowPlaced = false;
  let nextAssigned = false;
  let cursor = nowMin;

  for (const block of blocks) {
    const s = Date.parse(block.startsAt);
    const e = Date.parse(block.endsAt);
    const startMin = localMinutes(block.startsAt, tz);
    let state: "past" | "now" | "next" | "later";
    if (e <= nowMs) state = "past";
    else if (s <= nowMs) state = "now";
    else if (!nextAssigned && !block.cancelled) state = "next";
    else state = "later";

    if (!nowPlaced && (state === "next" || state === "later")) {
      rows.push({ type: "now", at: nowMin });
      nowPlaced = true;
    }
    if (state === "now") nowPlaced = true;

    if ((state === "next" || state === "later") && !block.cancelled && startMin - cursor >= MIN_GAP) {
      rows.push({ type: "gap", from: cursor, to: startMin, drift: cursor < DRIFT_END && startMin > DRIFT_START });
    }
    if (state === "next") nextAssigned = true;
    rows.push({ type: "block", block, state });
    if (state !== "past" && !block.cancelled) {
      const endMin = localMinutes(block.endsAt, tz);
      cursor = Math.max(cursor, endMin < startMin ? 24 * 60 : endMin);
    }
  }
  if (!nowPlaced && blocks.length) rows.push({ type: "now", at: nowMin });
  return rows;
}

export function Schedule({
  blocks,
  nowMs: initialNow,
  tz,
  todayKey,
  marked,
}: {
  blocks: Block[];
  nowMs: number;
  tz: string;
  todayKey: string;
  marked: boolean;
}) {
  const nowMs = useMinuteClock(initialNow);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [session, setSession] = useState<Block | null>(null);
  const rows = buildRows(blocks, nowMs, tz);
  const live = blocks.filter((b) => !b.cancelled);
  const hasNow = rows.some((r) => r.type === "block" && r.state === "now" && !r.block.cancelled);
  const remaining = live.filter((b) => Date.parse(b.endsAt) > nowMs).length;
  const open = (b: Block) => (b.source === "session" ? setSession(b) : setDraft({ event: b.event, dayKey: todayKey }));

  return (
    <section aria-labelledby="schedule-title" className="flex flex-col gap-2">
      <SectionHeader
        id="schedule-title"
        title="Schedule"
        count={live.length ? `${remaining} left` : undefined}
        action={
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDraft({ dayKey: todayKey })}>
            <Plus size={14} aria-hidden />
            Block
          </Button>
        }
      />

      {blocks.length === 0 ? (
        <EmptyState
          title="Nothing scheduled today"
          body={
            <>
              Add your weekly lectures once in{" "}
              <Link href="/planner/timetable" className="underline underline-offset-4 hover:text-ink">
                Timetable
              </Link>
              , or add a one-off block: a 60-minute focus block, training, an appointment.
            </>
          }
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
              const start = Math.ceil(row.from / 15) * 15;
              return (
                <li key={`gap-${i}`} className="flex items-center gap-3 py-1">
                  <span className="w-[92px] shrink-0 text-small text-ink-3">{hhmm(row.from)}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ dayKey: todayKey, start: hhmm(start), end: hhmm(Math.min(start + (row.drift ? 30 : 60), row.to)), kind: "focus" })
                    }
                    className="flex-1 rounded-sm border border-dashed border-rule px-3 py-1.5 text-left text-small text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
                  >
                    {durationLabel(mins)} open
                    {row.drift ? " · drift window, give it one small, specific task" : row.from >= 18 * 60 ? " · evening peak, good for hard coursework" : ""}
                  </button>
                </li>
              );
            }
            const { block, state } = row;
            const highlight = marked && !block.cancelled && (state === "now" || (state === "next" && !hasNow));
            const needsAnswer = block.kind === "focus" && state === "past" && block.event && !block.event.outcome;
            return (
              <li key={block.key}>
                <button
                  type="button"
                  onClick={() => open(block)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-sm py-2 text-left transition-colors hover:bg-sunken/60",
                    (state === "past" || block.cancelled) && "text-ink-3",
                  )}
                >
                  <span className="relative isolate w-[92px] shrink-0 pt-px text-small">
                    {highlight ? (
                      <span aria-hidden className="absolute -inset-x-1.5 -inset-y-0.5 -z-10 origin-left animate-sweep rounded-[3px] bg-mark" />
                    ) : null}
                    <span className={cn(highlight ? "font-medium text-mark-ink" : state === "past" || block.cancelled ? "" : "text-ink-2")}>
                      {formatTime(block.startsAt, tz)}–{formatTime(block.endsAt, tz)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", state !== "past" && !block.cancelled && "font-medium", block.cancelled && "line-through")}>
                      {block.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-small text-ink-2">
                      <span>{block.cancelled ? "Cancelled this week" : state === "now" ? "Now" : kindLabel(block.kind)}</span>
                      {block.event?.place ? <span>{PLACE_LABEL[block.event.place]}</span> : null}
                      {block.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} aria-hidden />
                          {block.location}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                {needsAnswer ? <FocusCheck id={block.event!.id} /> : null}
              </li>
            );
          })}
        </ol>
      )}

      <EventDialog draft={draft} onClose={() => setDraft(null)} tz={tz} />
      <SessionDialog block={session} onClose={() => setSession(null)} tz={tz} />
    </section>
  );
}

/** End-of-block self-report. Honest answers feed "Where you focus best". */
function FocusCheck({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const answer = (o: FocusOutcome) =>
    start(async () => {
      const r = await setFocusOutcome(id, o);
      notify(r.ok ? "Noted" : r.error, { tone: r.ok ? "ok" : "error" });
    });
  return (
    <div className="mb-2 ml-[104px] flex flex-wrap items-center gap-2 text-small">
      <span className="text-ink-2">Did you stay on it?</span>
      {(
        [
          ["stayed", "Yes"],
          ["partly", "Partly"],
          ["drifted", "Drifted"],
        ] as const
      ).map(([o, l]) => (
        <button
          key={o}
          type="button"
          disabled={pending}
          onClick={() => answer(o)}
          className="h-7 rounded-sm border border-rule px-3 text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
        >
          {l}
        </button>
      ))}
    </div>
  );
}
