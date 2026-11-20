"use client";

import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveEvent } from "@/app/actions/events";
import { captureTask } from "@/app/actions/tasks";
import { Button, Spinner } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatTime, keyLabel } from "@/lib/time";
import type { EventKind } from "@/lib/types";

type Item = {
  date: string;
  title: string;
  kind: "training" | "match" | "event" | "lecture" | "gym" | "social";
  location: string | null;
  startsAt: string;
  endsAt: string;
  clash: string | null;
};
type Result = { summary: string; unclear: string[]; items: Item[]; dropped: Array<{ title: string; reason: string }> };

const KIND_LABEL: Record<Item["kind"], string> = {
  training: "Training",
  match: "Match",
  event: "Event",
  lecture: "Lecture",
  gym: "Gym",
  social: "Social",
};

export function ShareImport({
  initialText,
  fromShare,
  aiReady,
  aiMessage,
  tz,
}: {
  initialText: string;
  fromShare: boolean;
  aiReady: boolean;
  aiMessage: string;
  tz: string;
}) {
  const [text, setText] = useState(initialText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const router = useRouter();
  const ran = useRef(false);

  async function read() {
    if (!text.trim()) return;
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "Couldn't read that message.");
      const r = j as Result;
      setResult(r);
      // Clashes start unticked: often the time moved, and only you can tell.
      setPicked(new Set(r.items.map((it, i) => (it.clash ? -1 : i)).filter((i) => i >= 0)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that message.");
    } finally {
      setLoading(false);
    }
  }

  // Sharing into LifeOS is the request, so read straight away (once).
  useEffect(() => {
    if (fromShare && aiReady && !ran.current) {
      ran.current = true;
      const t = window.setTimeout(read, 0);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toInbox = () =>
    start(async () => {
      const firstLine = text.trim().split("\n")[0].slice(0, 120) || "Shared message";
      const r = await captureTask({ title: `Shared: ${firstLine}`, raw: text.slice(0, 500), dueAt: null, dueHasTime: false });
      notify(r.ok ? "Saved to your Inbox" : r.error, { tone: r.ok ? "ok" : "error" });
      if (r.ok) router.push("/inbox");
    });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <label htmlFor="shared-text" className="text-small font-medium">
          Message
        </label>
        <textarea
          id="shared-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={6000}
          placeholder={"Paste the message here, e.g.\nTraining this week: Tue 7–9pm Sports Hall, Thu 6–8pm. Match Sat 1pm at Leeds."}
          className="min-h-36 w-full rounded-md border border-rule bg-surface p-3 text-body leading-relaxed placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          {aiReady ? (
            <Button variant="primary" onClick={read} pending={loading} disabled={!text.trim()}>
              {result ? "Read again" : "Find dates and times"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={toInbox} disabled={!text.trim() || pending}>
            Save to Inbox instead
          </Button>
        </div>
        {!aiReady ? <p className="text-small text-ink-2">{aiMessage} You can still save the message to your Inbox and add the times yourself.</p> : null}
        {aiReady ? <p className="text-micro text-ink-3">Only this message and your next three weeks of schedule are sent to the assistant.</p> : null}
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-small text-ink-2">
          <Spinner /> Reading the message…
        </p>
      ) : null}
      {error ? <p className="text-small text-danger">{error}</p> : null}

      {result ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Found" count={result.items.length || undefined} />
          <p className="text-small text-ink-2">{result.summary}</p>
          {result.items.length ? (
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {result.items.map((it, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-3 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--ink)]"
                      checked={picked.has(i)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        setPicked(next);
                      }}
                    />
                    <span className="w-28 shrink-0 text-small text-ink-2">
                      {keyLabel(it.date)}
                      <br />
                      {formatTime(it.startsAt, tz)}–{formatTime(it.endsAt, tz)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium">{it.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-small text-ink-2">
                        <span>{KIND_LABEL[it.kind]}</span>
                        {it.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} aria-hidden />
                            {it.location}
                          </span>
                        ) : null}
                      </span>
                      {it.clash ? (
                        <span className="mt-1 block text-small text-danger">
                          Overlaps {it.clash}. If the time has moved, add this and cancel {it.clash} for that week on Today.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-2">No dated events with times in that message.</p>
          )}
          {result.unclear.length ? (
            <div className="text-small text-ink-2">
              <p className="font-medium text-ink">Not clear from the message</p>
              <ul className="mt-1 list-disc pl-4">
                {result.unclear.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.dropped.length ? (
            <p className="text-micro text-ink-3">
              Skipped {result.dropped.length}: {result.dropped.map((d) => `${d.title} (${d.reason})`).join("; ")}.
            </p>
          ) : null}
          {result.items.length ? (
            <Button
              variant="primary"
              className="self-start"
              pending={pending}
              disabled={!picked.size}
              onClick={() =>
                start(async () => {
                  let added = 0;
                  let failed = 0;
                  for (const i of [...picked].sort((a, b) => a - b)) {
                    const it = result.items[i];
                    const r = await saveEvent({
                      title: it.title,
                      kind: it.kind as EventKind,
                      startsAt: it.startsAt,
                      endsAt: it.endsAt,
                      location: it.location,
                    });
                    if (r.ok) added++;
                    else failed++;
                  }
                  notify(failed ? `Added ${added}, ${failed} couldn't be saved` : `Added ${added} to your schedule`, { tone: failed ? "error" : "ok" });
                  if (added) router.push("/planner");
                })
              }
            >
              Add {picked.size} to schedule
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
