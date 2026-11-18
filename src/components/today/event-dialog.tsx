"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteEvent, saveEvent } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dateKey, formatTime, localToIso } from "@/lib/time";
import { EVENT_KIND_LABEL, type CalendarEvent, type EventKind } from "@/lib/types";

export type EventDraft = { event?: CalendarEvent; dayKey: string; start?: string; end?: string };

export function EventDialog({ draft, onClose, tz }: { draft: EventDraft | null; onClose: () => void; tz: string }) {
  return (
    <Dialog open={Boolean(draft)} onClose={onClose} title={draft?.event ? "Edit block" : "Add a block"}>
      {draft ? <EventForm key={draft.event?.id ?? "new"} draft={draft} onClose={onClose} tz={tz} /> : null}
    </Dialog>
  );
}

function EventForm({ draft, onClose, tz }: { draft: EventDraft; onClose: () => void; tz: string }) {
  const e = draft.event;
  const [title, setTitle] = useState(e?.title ?? "");
  const [kind, setKind] = useState<EventKind>(e?.kind ?? "focus");
  const [day, setDay] = useState(e ? dateKey(e.starts_at, tz) : draft.dayKey);
  const [start, setStart] = useState(e ? formatTime(e.starts_at, tz) : (draft.start ?? "10:00"));
  const [end, setEnd] = useState(e ? formatTime(e.ends_at, tz) : (draft.end ?? "11:00"));
  const [location, setLocation] = useState(e?.location ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveEvent({
        id: e?.id,
        title,
        kind,
        startsAt: localToIso(day, start, tz),
        endsAt: localToIso(day, end, tz),
        location: location || null,
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

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <Field label="What">
        {(id) => (
          <Input
            id={id}
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            placeholder="10 past-paper questions, Ch. 4"
            maxLength={200}
            required
            autoFocus
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label="Day">{(id) => <Input id={id} type="date" value={day} onChange={(ev) => setDay(ev.target.value)} required />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">{(id) => <Input id={id} type="time" value={start} onChange={(ev) => setStart(ev.target.value)} required />}</Field>
        <Field label="Ends">{(id) => <Input id={id} type="time" value={end} onChange={(ev) => setEnd(ev.target.value)} required />}</Field>
      </div>
      <Field label="Where" hint={kind === "focus" ? "Library, home… Phase 4 compares where you get more done." : undefined}>
        {(id) => <Input id={id} value={location} onChange={(ev) => setLocation(ev.target.value)} maxLength={120} placeholder="Optional" />}
      </Field>

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
