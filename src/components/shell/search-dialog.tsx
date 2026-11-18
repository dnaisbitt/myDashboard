"use client";

import { FolderKanban, Repeat, Search, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { searchAll, type SearchHit } from "@/app/actions/tasks";
import { Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
    <Dialog open={open} onClose={onClose} title="Search" description="Tasks, projects, goals and habits.">
      {open ? <SearchBody onPick={onPick} onClose={onClose} tz={tz} /> : null}
    </Dialog>
  );
}

function SearchBody({ onPick, onClose, tz }: { onPick: (t: Task) => void; onClose: () => void; tz: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [nowMs] = useState(() => Date.now());
  const router = useRouter();

  useEffect(() => {
    const term = q.trim();
    const t = window.setTimeout(() => {
      if (!term) {
        setResults(null);
        return;
      }
      start(async () => {
        const res = await searchAll(term);
        if (res.ok) {
          setResults(res.data ?? []);
          setError(null);
        } else setError(res.error);
      });
    }, 180);
    return () => window.clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          autoFocus
          type="search"
          aria-label="Search"
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
          {results?.map((hit) => {
            const row = "flex w-full items-baseline gap-3 rounded-sm px-2 py-2 text-left hover:bg-sunken";
            if (hit.type === "task") {
              const t = hit.task;
              return (
                <li key={`t${t.id}`}>
                  <button type="button" onClick={() => onPick(t)} className={row}>
                    <span className={cn("flex-1 truncate", t.status === "done" && "text-ink-3 line-through")}>{t.title}</span>
                    {t.due_at ? <span className="text-small text-ink-2">{describeDue(t.due_at, t.due_has_time, nowMs, tz).label}</span> : null}
                    <span className="text-micro text-ink-3">{STATUS_LABEL[t.status]}</span>
                  </button>
                </li>
              );
            }
            const Icon = hit.type === "goal" ? Target : hit.type === "project" ? FolderKanban : Repeat;
            const href = hit.type === "goal" ? `/goals/${hit.id}` : hit.type === "project" ? `/projects/${hit.id}` : "/habits";
            return (
              <li key={`${hit.type}${hit.id}`}>
                <button type="button" onClick={() => go(href)} className={row}>
                  <Icon size={14} className="shrink-0 self-center text-ink-3" aria-hidden />
                  <span className="flex-1 truncate">{hit.title}</span>
                  <span className="text-micro text-ink-3 capitalize">{hit.type}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
