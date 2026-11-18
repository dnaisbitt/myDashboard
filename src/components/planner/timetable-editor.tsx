"use client";

import { Plus, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { importEvents } from "@/app/actions/events";
import { deleteSession, saveSession } from "@/app/actions/timetable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { parseIcs, type IcsEvent } from "@/lib/ics";
import { addDaysToKey, formatShortDay, formatTime, keyLabel } from "@/lib/time";
import { SESSION_KIND_LABEL, type SessionKind, type TimetableSession } from "@/lib/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function TimetableEditor({ sessions, todayKey, tz }: { sessions: TimetableSession[]; todayKey: string; tz: string }) {
  const [editing, setEditing] = useState<TimetableSession | "new" | null>(null);
  const [newDay, setNewDay] = useState(1);
  const current = sessions.filter((s) => s.ends_on >= todayKey);
  const past = sessions.filter((s) => s.ends_on < todayKey);

  return (
    <div className="flex flex-col gap-10">
      <p className="max-w-[62ch] text-body text-ink-2">
        Enter your weekly timetable once. Each session repeats every week between its first and last dates, and you can mark a single
        week as cancelled from Today or the Planner. MyLboro has no calendar export, so this doesn&apos;t sync automatically.
      </p>

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
        {DAYS.map((d, i) => {
          const items = current.filter((s) => s.weekday === i + 1);
          return (
            <section key={d} className="flex flex-col gap-1">
              <SectionHeader
                title={d}
                count={items.length || undefined}
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      setNewDay(i + 1);
                      setEditing("new");
                    }}
                    aria-label={`Add a session on ${d}`}
                  >
                    <Plus size={14} aria-hidden />
                  </Button>
                }
              />
              {items.length ? (
                <ul className="flex flex-col divide-y divide-rule border-y border-rule">
                  {items.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setEditing(s)} className="flex w-full items-baseline gap-3 py-2 text-left hover:bg-sunken/40">
                        <span className="w-[92px] shrink-0 text-small text-ink-2">
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.title}</span>
                          <span className="text-small text-ink-2">
                            {SESSION_KIND_LABEL[s.kind]}
                            {s.location ? ` · ${s.location}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-3">Nothing fixed.</p>
              )}
            </section>
          );
        })}
      </div>

      {past.length ? <p className="text-small text-ink-3">{past.length} session(s) from earlier terms are hidden.</p> : null}

      <IcsImport todayKey={todayKey} tz={tz} />

      <SessionDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        session={editing && editing !== "new" ? editing : undefined}
        weekday={newDay}
        todayKey={todayKey}
      />
    </div>
  );
}

function SessionDialog({
  open,
  onClose,
  session,
  weekday,
  todayKey,
}: {
  open: boolean;
  onClose: () => void;
  session?: TimetableSession;
  weekday: number;
  todayKey: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={session ? "Edit session" : "Add a weekly session"}>
      {open ? <SessionForm session={session} weekday={weekday} todayKey={todayKey} onClose={onClose} /> : null}
    </Dialog>
  );
}

function SessionForm({ session, weekday, todayKey, onClose }: { session?: TimetableSession; weekday: number; todayKey: string; onClose: () => void }) {
  const [title, setTitle] = useState(session?.title ?? "");
  const [kind, setKind] = useState<SessionKind>(session?.kind ?? "lecture");
  const [day, setDay] = useState(session?.weekday ?? weekday);
  const [start, setStart] = useState(session?.start_time.slice(0, 5) ?? "09:00");
  const [end, setEnd] = useState(session?.end_time.slice(0, 5) ?? "10:00");
  const [location, setLocation] = useState(session?.location ?? "");
  const [startsOn, setStartsOn] = useState(session?.starts_on ?? todayKey);
  const [endsOn, setEndsOn] = useState(session?.ends_on ?? addDaysToKey(todayKey, 7 * 11));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startT] = useTransition();
  const { notify } = useToast();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startT(async () => {
          const r = await saveSession({
            id: session?.id,
            title,
            kind,
            weekday: day,
            startTime: start,
            endTime: end,
            location: location || null,
            startsOn,
            endsOn,
          });
          if (!r.ok) return setError(r.error);
          notify(session ? "Session saved" : "Session added");
          onClose();
        });
      }}
    >
      <Field label="Name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus placeholder="Machine Learning" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as SessionKind)}>
              {Object.entries(SESSION_KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Day">
          {(id) => (
            <Select id={id} value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">{(id) => <Input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} required />}</Field>
        <Field label="Ends">{(id) => <Input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />}</Field>
      </div>
      <Field label="Where">{(id) => <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Optional" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First week">{(id) => <Input id={id} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />}</Field>
        <Field label="Last week" hint="End of term">
          {(id, d) => <Input id={id} aria-describedby={d} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />}
        </Field>
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {session ? (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending}>
          {session ? "Save" : "Add session"}
        </Button>
      </div>
      {session ? (
        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          pending={pending}
          title="Delete this session?"
          body={<>“{session.title}” will disappear from every week, past and future. To skip one week, mark it cancelled instead.</>}
          onConfirm={() =>
            startT(async () => {
              const r = await deleteSession(session.id);
              setConfirming(false);
              if (!r.ok) return setError(r.error);
              notify("Session deleted");
              onClose();
            })
          }
        />
      ) : null}
    </form>
  );
}

function IcsImport({ todayKey, tz }: { todayKey: string; tz: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ events: IcsEvent[]; skipped: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { notify } = useToast();

  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <SectionHeader title="Import an .ics file" />
      <p className="max-w-[62ch] text-small text-ink-2">
        Optional. If you ever get a calendar file (from another calendar app, or if the university starts offering one), import it here.
        Events land as one-off blocks for the next 16 weeks. Weekly repeats are expanded; all-day items are skipped.
      </p>
      <div>
        <input
          ref={input}
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          id="ics-file"
          onChange={async (e) => {
            setError(null);
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2_000_000) return setError("That file is over 2 MB.");
            const text = await file.text();
            if (!text.includes("BEGIN:VCALENDAR")) return setError("That doesn't look like a calendar (.ics) file.");
            const parsed = parseIcs(text, { tz, fromKey: todayKey, toKey: addDaysToKey(todayKey, 7 * 16) });
            setPreview({ ...parsed, name: file.name });
            e.target.value = "";
          }}
        />
        <Button size="sm" onClick={() => input.current?.click()}>
          <Upload size={14} aria-hidden />
          Choose file
        </Button>
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      {preview ? (
        <div className="flex flex-col gap-3 rounded-md border border-rule bg-surface p-4">
          {preview.events.length ? (
            <>
              <p className="text-body">
                <span className="font-medium">{preview.events.length} events</span> from {preview.name}, {formatShortDay(preview.events[0].startsAt, tz)} to{" "}
                {formatShortDay(preview.events.at(-1)!.startsAt, tz)}
                {preview.skipped ? <span className="text-ink-2"> · {preview.skipped} skipped</span> : null}
              </p>
              <ul className="max-h-48 overflow-y-auto text-small text-ink-2">
                {preview.events.slice(0, 12).map((ev, i) => (
                  <li key={i}>
                    {formatShortDay(ev.startsAt, tz)} {formatTime(ev.startsAt, tz)}–{formatTime(ev.endsAt, tz)} · {ev.title}
                  </li>
                ))}
                {preview.events.length > 12 ? <li>…and {preview.events.length - 12} more</li> : null}
              </ul>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  pending={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await importEvents(
                        preview.events.map((ev) => ({ ...ev, kind: /lecture|seminar|tutorial|lab/i.test(ev.title) ? "lecture" : "event" })),
                      );
                      if (!r.ok) return setError(r.error);
                      notify(`Imported ${r.data!.count} events`);
                      setPreview(null);
                    })
                  }
                >
                  Import {preview.events.length} events
                </Button>
              </div>
            </>
          ) : (
            <EmptyState title="Nothing to import" body={`No timed events in the next 16 weeks (from ${keyLabel(todayKey)}).`} />
          )}
        </div>
      ) : null}
    </section>
  );
}
