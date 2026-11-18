"use client";

import { CalendarClock, CalendarDays, CornerDownLeft, Inbox } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { saveEvent } from "@/app/actions/events";
import { captureTask } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { dueToIso, parseCapture } from "@/lib/capture/parse";
import { describeDue, formatShortDay, localToIso } from "@/lib/time";

export function CaptureDialog({
  open,
  onClose,
  tz,
  initialAsPriority,
}: {
  open: boolean;
  onClose: () => void;
  tz: string;
  initialAsPriority?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Capture" description="One line. “Friday 5pm” becomes a deadline, “dentist Tue 3pm” an event.">
      {open ? <CaptureForm onDone={onClose} tz={tz} initialAsPriority={initialAsPriority} /> : null}
    </Dialog>
  );
}

function CaptureForm({ onDone, tz, initialAsPriority }: { onDone: () => void; tz: string; initialAsPriority?: boolean }) {
  const [text, setText] = useState("");
  const [asPriority, setAsPriority] = useState(Boolean(initialAsPriority));
  const [forceTask, setForceTask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  // Reference time is fixed when the dialog opens.
  const [nowMs] = useState(() => Date.now());

  const parsed = useMemo(() => parseCapture(text, new Date(nowMs), tz), [text, tz, nowMs]);
  const isEvent = parsed.kind === "event" && !forceTask && !asPriority;
  const dueIso = parsed.due ? dueToIso(parsed.due, tz) : null;

  const preview = (() => {
    if (!parsed.title) return null;
    if (isEvent && parsed.due) {
      return {
        icon: CalendarClock,
        text: `Event · ${formatShortDay(dueIso!, tz)}, ${parsed.due.time}–${parsed.end}`,
        sub: "Goes on your schedule",
      };
    }
    if (dueIso && parsed.due) {
      const rel = describeDue(dueIso, Boolean(parsed.due.time), nowMs, tz);
      return {
        icon: CalendarDays,
        text: `Task · due ${formatShortDay(dueIso, tz)}${parsed.due.time ? `, ${parsed.due.time}` : ""}`,
        sub: rel.label,
      };
    }
    if (asPriority) return { icon: CalendarDays, text: "Task · one of today's three", sub: "no due date" };
    return {
      icon: Inbox,
      text: parsed.category ? `Inbox · ${parsed.category}` : "Goes to your Inbox",
      sub: "no date found, you'll decide later",
    };
  })();

  function submit() {
    if (!parsed.title || pending) return;
    setError(null);
    start(async () => {
      if (isEvent && parsed.due?.time && parsed.end) {
        const res = await saveEvent({
          title: parsed.title,
          kind: "event",
          startsAt: localToIso(parsed.due.key, parsed.due.time, tz),
          endsAt: localToIso(parsed.due.key, parsed.end, tz),
          location: null,
        });
        if (!res.ok) return setError(res.error);
        notify("Added to your schedule");
        return onDone();
      }
      const res = await captureTask({
        title: parsed.title,
        raw: text,
        dueAt: dueIso,
        dueHasTime: Boolean(parsed.due?.time),
        asPriority,
        category: parsed.category,
      });
      if (!res.ok) return setError(res.error);
      notify(res.data?.status === "inbox" ? "Captured to Inbox" : asPriority ? "Added to today's three" : "Task added");
      onDone();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <label htmlFor="capture-input" className="sr-only">
        What&apos;s on your mind?
      </label>
      <input
        id="capture-input"
        autoFocus
        autoComplete="off"
        enterKeyHint="done"
        maxLength={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="coursework deadline Friday 5pm"
        aria-invalid={Boolean(error)}
        aria-describedby="capture-preview"
        className="h-12 w-full rounded-md border border-rule bg-canvas px-3.5 text-lead placeholder:text-ink-3 focus:border-ink focus:outline-none"
      />

      <div id="capture-preview" aria-live="polite" className="min-h-10 text-small">
        {error ? (
          <p className="text-danger">{error}</p>
        ) : preview ? (
          <div className="flex animate-rise items-start gap-2.5">
            <preview.icon size={15} className="mt-0.5 text-ink-2" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {parsed.title}
                <span className="font-normal text-ink-2"> · {preview.text}</span>
              </p>
              <p className="text-ink-2">
                {preview.sub}
                {parsed.kind === "event" && !asPriority ? (
                  <>
                    {" · "}
                    <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setForceTask((f) => !f)}>
                      {forceTask ? "make it an event" : "make it a task instead"}
                    </button>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-ink-3">Tasks, deadlines, appointments, things to buy. Anything without a date waits in the Inbox.</p>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-rule pt-4">
        <label className="flex cursor-pointer items-center gap-2 text-small text-ink-2 select-none">
          <input type="checkbox" checked={asPriority} onChange={(e) => setAsPriority(e.target.checked)} className="size-4 accent-[var(--ink)]" />
          One of today&apos;s three
        </label>
        <Button type="submit" variant="primary" size="sm" className="ml-auto" pending={pending} disabled={!parsed.title}>
          Save
          <CornerDownLeft size={14} aria-hidden className="opacity-70" />
        </Button>
      </div>
    </form>
  );
}
