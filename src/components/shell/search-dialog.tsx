"use client";

import { Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { searchTasks } from "@/app/actions/tasks";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { describeDue } from "@/lib/time";
import type { Task } from "@/lib/types";

const STATUS_LABEL: Record<Task["status"], string> = { inbox: "Inbox", open: "Open", done: "Done", archived: "Archived" };

export function SearchDialog({
  open,
  onClose,
  onPick,
  tz,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: Task) => void;
  tz: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Search" description="Tasks and Inbox for now. Projects, goals and notes join in Phase 4.">
      {open ? <SearchBody onPick={onPick} tz={tz} /> : null}
    </Dialog>
  );
}

function SearchBody({ onPick, tz }: { onPick: (t: Task) => void; tz: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    const term = q.trim();
    const t = window.setTimeout(() => {
      if (!term) {
        setResults(null);
        return;
      }
      start(async () => {
        const res = await searchTasks(term);
        if (res.ok) {
          setResults(res.data ?? []);
          setError(null);
        } else setError(res.error);
      });
    }, 180);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          autoFocus
          type="search"
          aria-label="Search tasks"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="h-11 w-full rounded-md border border-rule bg-canvas pr-10 pl-10 text-body placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        {pending ? <Spinner className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3" /> : null}
      </div>
      <div className="max-h-[50dvh] min-h-16 overflow-y-auto" aria-live="polite">
        {error ? <p className="text-small text-danger">{error}</p> : null}
        {results && results.length === 0 ? <p className="py-3 text-small text-ink-2">Nothing matches “{q.trim()}”.</p> : null}
        <ul className="flex flex-col">
          {results?.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t)}
                className="flex w-full items-baseline gap-3 rounded-sm px-2 py-2 text-left hover:bg-sunken"
              >
                <span className={cn("flex-1 truncate", t.status === "done" && "text-ink-3 line-through")}>{t.title}</span>
                {t.due_at ? <span className="text-small text-ink-2">{describeDue(t.due_at, t.due_has_time, nowMs, tz).label}</span> : null}
                <span className="text-micro text-ink-3">{STATUS_LABEL[t.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
