"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteEvent, saveEvent } from "@/app/actions/events";
import { setSessionCancelled } from "@/app/actions/timetable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { Block } from "@/lib/schedule";
import { dateKey, formatTime, keyLabel, localToIso, minutesToTime, timeToMinutes } from "@/lib/time";
import { EVENT_KIND_LABEL, PLACE_LABEL, SESSION_KIND_LABEL, type CalendarEvent, type EventKind, type FocusPlace } from "@/lib/types";

export type EventDraft = { event?: CalendarEvent; dayKey: string; start?: string; end?: string; kind?: EventKind; title?: string };

export function EventDialog({ draft, onClose, tz }: { draft: EventDraft | null; onClose: () => void; tz: string }) {
  return (
    <Dialog open={Boolean(draft)} onClose={onClose} title={draft?.event ? "Edit block" : "Add a block"}>
      {draft ? <EventForm key={draft.event?.id ?? `new-${draft.dayKey}-${draft.start}`} draft={draft} onClose={onClose} tz={tz} /> : null}
    </Dialog>
  );
}

function EventForm({ draft, onClose, tz }: { draft: EventDraft; onClose: () => void; tz: string }) {
  const e = draft.event;
  const [title, setTitle] = useState(e?.title ?? draft.title ?? "");
  const [kind, setKind] = useState<EventKind>(e?.kind ?? draft.kind ?? "focus");
  const [day, setDay] = useState(e ? dateKey(e.starts_at, tz) : draft.dayKey);
  const [start, setStart] = useState(e ? formatTime(e.starts_at, tz) : (draft.start ?? "10:00"));
  const [end, setEnd] = useState(e ? formatTime(e.ends_at, tz) : (draft.end ?? "11:00"));
  const [location, setLocation] = useState(e?.location ?? "");
  const [place, setPlace] = useState<FocusPlace | "">(e?.place ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();
  const isFocus = kind === "focus";

  function save() {
    setError(null);
    if (end <= start) return setError("It has to end after it starts.");
    startTransition(async () => {
      const res = await saveEvent({
        id: e?.id,
        title,
        kind,
        startsAt: localToIso(day, start, tz),
        endsAt: localToIso(day, end, tz),
        location: location || null,
        place: isFocus ? place || null : null,
      });
      if (!res.ok) return setError(res.error);
      notify(e ? "Block updated" : "Block added");
      onClose();
    });
  }

  function remove() {
    if (!e) return;
    startTransition(async () => {
      const res = await deleteEvent(e.id);
      setConfirming(false);
      if (!res.ok) return setError(res.error);
      notify("Block deleted");
      onClose();
    });
  }

  const setLength = (mins: number) => setEnd(minutesToTime(Math.min(timeToMinutes(start) + mins, 23 * 60 + 59)));

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Type">
        {(id) => (
          <Select id={id} value={kind} onChange={(ev) => setKind(ev.target.value as EventKind)}>
            {Object.entries(EVENT_KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={isFocus ? "One concrete task" : "What"}
        hint={isFocus ? "Specific enough to know when it's done: “10 past-paper questions on Ch. 4”, not “revise Ch. 4”." : undefined}
      >
        {(id, d) => (
          <Input
            id={id}
            aria-describedby={d}
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        )}
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Day">{(id) => <Input id={id} type="date" value={day} onChange={(ev) => setDay(ev.target.value)} required />}</Field>
        <Field label="Starts">{(id) => <Input id={id} type="time" value={start} onChange={(ev) => setStart(ev.target.value)} required />}</Field>
        <Field label="Ends">{(id) => <Input id={id} type="time" value={end} onChange={(ev) => setEnd(ev.target.value)} required />}</Field>
      </div>
      {isFocus ? (
        <>
          <div className="flex items-center gap-2 text-small">
            <span className="text-ink-2">Length</span>
            {[30, 60].map((m) => {
              const active = timeToMinutes(end) - timeToMinutes(start) === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLength(m)}
                  aria-pressed={active}
                  className={cn("h-7 rounded-full px-3", active ? "bg-ink text-canvas" : "bg-sunken text-ink-2 hover:text-ink")}
                >
                  {m} min
                </button>
              );
            })}
            {timeToMinutes(end) - timeToMinutes(start) > 60 ? (
              <span className="text-ink-2">Longer than your usual 30–60 min. Consider two blocks.</span>
            ) : null}
          </div>
          <Field
            label="Where"
            hint={
              place === "group_room"
                ? "Group rooms are lower-focus. Keep solo work for the library or home."
                : "Tagging the place lets Routines & focus show where you get more done."
            }
          >
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={place} onChange={(ev) => setPlace(ev.target.value as FocusPlace | "")}>
                <option value="">Not set</option>
                {Object.entries(PLACE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      ) : (
        <Field label="Where">
          {(id) => <Input id={id} value={location} onChange={(ev) => setLocation(ev.target.value)} maxLength={120} placeholder="Optional" />}
        </Field>
      )}

      {error ? <p className="text-small text-danger">{error}</p> : null}

      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {e ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label="Delete block" className="px-2 text-danger hover:text-danger">
            <Trash2 size={15} aria-hidden />
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          {e ? "Save" : "Add block"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
        pending={pending}
        title="Delete this block?"
        body={<>“{e?.title}” will be removed from your schedule.</>}
      />
    </form>
  );
}

/** A timetable occurrence: one tap to cancel it this week only. */
export function SessionDialog({ block, onClose, tz }: { block: Block | null; onClose: () => void; tz: string }) {
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const s = block?.session;
  return (
    <Dialog open={Boolean(block)} onClose={onClose} title={block?.title ?? "Session"}>
      {block && s ? (
        <div className="flex flex-col gap-4">
          <p className="text-body">
            {SESSION_KIND_LABEL[s.kind]} · {keyLabel(block.dateKey, { weekday: "long", day: "numeric", month: "long" })},{" "}
            {formatTime(block.startsAt, tz)}–{formatTime(block.endsAt, tz)}
            {s.location ? <span className="text-ink-2"> · {s.location}</span> : null}
          </p>
          <p className="text-small text-ink-2">
            {block.cancelled
              ? "Marked as cancelled for this date. The rest of the weekly schedule is unchanged."
              : "Cancellations usually arrive by email. Mark this one and only this date changes."}
          </p>
          <div className="flex items-center gap-2 border-t border-rule pt-4">
            <Link href="/planner/timetable" className="text-small text-ink-2 underline underline-offset-4 hover:text-ink" onClick={onClose}>
              Edit weekly timetable
            </Link>
            <Button
              variant={block.cancelled ? "secondary" : "primary"}
              size="sm"
              className="ml-auto"
              pending={pending}
              onClick={() =>
                start(async () => {
                  const r = await setSessionCancelled(s.id, block.dateKey, !block.cancelled);
                  notify(r.ok ? (block.cancelled ? "Restored" : "Cancelled for this date") : r.error, { tone: r.ok ? "ok" : "error" });
                  if (r.ok) onClose();
                })
              }
            >
              {block.cancelled ? "Restore this date" : "Cancelled this week"}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
