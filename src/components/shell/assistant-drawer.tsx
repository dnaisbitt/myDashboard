"use client";

import { ArrowUp, ListPlus, RotateCcw, Sparkles, Square, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createTask, getTaskFormOptions } from "@/app/actions/tasks";
import { Markdown } from "@/components/ai/markdown";
import { Button, IconButton, Spinner } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { STREAM_ERROR } from "@/lib/ai/stream-protocol";
import { cn } from "@/lib/cn";
import { localToIso } from "@/lib/time";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };
type Status = { ready: boolean; message: string; model: string | null; spend: { month: string; cap: string } | null };

const ACTIONS = [
  { key: "focus", label: "What should I focus on today?" },
  { key: "plan_day", label: "Plan my day" },
  { key: "plan_week", label: "Plan my week" },
  { key: "overcommit", label: "Am I overcommitted?" },
  { key: "review", label: "Weekly review" },
] as const;

/**
 * Slide-out assistant. Reads a fresh snapshot of your data on every request and
 * only suggests. The conversation is kept in this panel only (not saved).
 */
export function AssistantDrawer({
  open,
  onClose,
  ready,
  message,
  tz,
}: {
  open: boolean;
  onClose: () => void;
  ready: boolean;
  message: string;
  tz: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="assistant-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[460px] bg-transparent p-0 text-ink"
    >
      {open ? (
        <div className="flex h-full animate-[rise_200ms_var(--ease-out-soft)] flex-col border-l border-rule bg-surface shadow-float">
          <div className="flex items-center gap-2 border-b border-rule px-5 py-4">
            <Sparkles size={16} aria-hidden />
            <h2 id="assistant-title" className="flex-1 text-body font-semibold">
              Assistant
            </h2>
            <IconButton label="Close assistant" size="sm" onClick={onClose}>
              <X size={16} aria-hidden />
            </IconButton>
          </div>
          {ready ? <Chat tz={tz} /> : <NotReady message={message} onClose={onClose} />}
        </div>
      ) : null}
    </dialog>
  );
}

function NotReady({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6">
      <p className="text-body font-medium">Not configured</p>
      <p className="text-small text-ink-2">{message}</p>
      <div className="rounded-md border border-dashed border-rule p-4 text-small text-ink-2">
        <p className="font-medium text-ink">When it&apos;s on, it can</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>tell you what to focus on today, from your real tasks and schedule</li>
          <li>plan your day and week, and flag overcommitment</li>
          <li>break a project or vague idea into tasks you approve</li>
          <li>run your Sunday weekly review with you</li>
        </ul>
        <p className="mt-3">It only sees what LifeOS stores. It can&apos;t see your phone, email, MyLboro or bank.</p>
      </div>
      <Link href="/settings#assistant" onClick={onClose} className="text-small text-ink-2 underline underline-offset-4 hover:text-ink">
        Assistant settings
      </Link>
    </div>
  );
}

function Chat({ tz }: { tz: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<"chat" | "breakdown">("chat");
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const loadStatus = () =>
    fetch("/api/ai")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});

  useEffect(() => {
    loadStatus();
    return () => abort.current?.abort();
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs]);

  async function send(body: { action?: string; text?: string }) {
    if (busy) return;
    const history = msgs.filter((m) => !m.error);
    const userText = body.text ?? ACTIONS.find((a) => a.key === body.action)?.label ?? "";
    const next: Msg[] = [...history, { role: "user", content: userText }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.current.signal,
        body: JSON.stringify(
          body.action ? { action: body.action, messages: history.map(({ role, content }) => ({ role, content })) } : { messages: next.map(({ role, content }) => ({ role, content })) },
        ),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "The assistant couldn't answer.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const errAt = text.indexOf(STREAM_ERROR);
        setMsgs((m) => [
          ...m.slice(0, -1),
          errAt >= 0
            ? { role: "assistant", content: text.slice(0, errAt).trim() || text.slice(errAt + STREAM_ERROR.length), error: true }
            : { role: "assistant", content: text },
        ]);
      }
    } catch (e) {
      const stopped = e instanceof Error && e.name === "AbortError";
      setMsgs((m) => {
        const last = m.at(-1);
        if (stopped && last?.content) return m;
        return [...m.slice(0, -1), { role: "assistant", content: stopped ? "Stopped." : e instanceof Error ? e.message : "Something went wrong.", error: true }];
      });
    } finally {
      setBusy(false);
      abort.current = null;
      loadStatus();
    }
  }

  return (
    <>
      <div ref={scroller} className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5" aria-live="polite">
        {mode === "breakdown" ? (
          <Breakdown tz={tz} onDone={() => setMode("chat")} onSpent={loadStatus} />
        ) : msgs.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-small text-ink-2">Ask anything about your plans, or start with one of these. It reads your current tasks, schedule, habits, goals and money each time, and only suggests.</p>
            <div className="flex flex-col items-start gap-1.5">
              {ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => send({ action: a.key })}
                  className="rounded-full border border-rule px-3 py-1.5 text-left text-small text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
                >
                  {a.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode("breakdown")}
                className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-small text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
              >
                <ListPlus size={14} aria-hidden />
                Break a project or idea into tasks
              </button>
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-md bg-sunken px-3 py-2 text-body">{m.content}</p>
              ) : m.error ? (
                <p className="text-small text-danger">{m.content}</p>
              ) : m.content ? (
                <div className="text-body leading-relaxed">
                  <Markdown text={m.content} />
                </div>
              ) : (
                <span className="flex items-center gap-2 text-small text-ink-2">
                  <Spinner /> Reading your data…
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {mode === "chat" ? (
        <div className="border-t border-rule px-5 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) send({ text: input.trim() });
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="assistant-input" className="sr-only">
              Message the assistant
            </label>
            <textarea
              id="assistant-input"
              rows={1}
              value={input}
              maxLength={4000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim()) send({ text: input.trim() });
                }
              }}
              placeholder="Ask about your day, week or a project…"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-sm border border-rule bg-canvas px-3 py-2 text-body placeholder:text-ink-3 focus:border-ink focus:outline-none"
            />
            {busy ? (
              <IconButton label="Stop" onClick={() => abort.current?.abort()} className="border border-rule">
                <Square size={14} aria-hidden />
              </IconButton>
            ) : (
              <IconButton label="Send" type="submit" disabled={!input.trim()} className="bg-ink text-canvas hover:bg-ink/85 hover:text-canvas">
                <ArrowUp size={16} aria-hidden />
              </IconButton>
            )}
          </form>
          <div className="mt-2 flex items-center gap-3 text-micro text-ink-3">
            {msgs.length ? (
              <button type="button" onClick={() => setMsgs([])} disabled={busy} className="inline-flex items-center gap-1 hover:text-ink">
                <RotateCcw size={11} aria-hidden />
                New conversation
              </button>
            ) : null}
            <span className="ml-auto">
              {status?.spend ? `${status.spend.month} of ${status.spend.cap} this month (estimate)` : ""}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

type Proposal = { title: string; minutes: number; due: string | null };

function Breakdown({ tz, onDone, onSpent }: { tz: string; onDone: () => void; onSpent: () => void }) {
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [projectId, setProjectId] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; tasks: Proposal[]; questions: string[]; projectId: string | null } | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const { notify } = useToast();

  useEffect(() => {
    getTaskFormOptions().then((r) => r.ok && setProjects(r.data!.projects));
  }, []);

  async function run() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(projectId ? { projectId } : { text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "Couldn't break that down.");
      setResult(j);
      setPicked(new Set(j.tasks.map((_: Proposal, i: number) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't break that down.");
    } finally {
      setLoading(false);
      onSpent();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onDone} className="self-start text-small text-ink-2 hover:text-ink">
        ← Back
      </button>
      <p className="text-body font-medium">Break into tasks</p>
      {!result ? (
        <>
          <label className="flex flex-col gap-1.5 text-small">
            <span className="font-medium">A project</span>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Not a project, describe it below</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </label>
          {!projectId ? (
            <label className="flex flex-col gap-1.5 text-small">
              <span className="font-medium">Or an idea</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1000}
                placeholder="e.g. tutoring first-years in Python as a side hustle"
                className="min-h-20 rounded-sm border border-rule bg-canvas p-2.5 text-body placeholder:text-ink-3 focus:border-ink focus:outline-none"
              />
            </label>
          ) : null}
          {error ? <p className="text-small text-danger">{error}</p> : null}
          <Button variant="primary" pending={loading} disabled={!projectId && text.trim().length < 3} onClick={run} className="self-start">
            Suggest tasks
          </Button>
          <p className="text-micro text-ink-3">Nothing is added until you pick the tasks you want.</p>
        </>
      ) : (
        <>
          <p className="text-small text-ink-2">{result.summary}</p>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {result.tasks.map((t, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--ink)]"
                    checked={picked.has(i)}
                    onChange={(e) => {
                      const s = new Set(picked);
                      if (e.target.checked) s.add(i);
                      else s.delete(i);
                      setPicked(s);
                    }}
                  />
                  <span className="flex-1">
                    <span className="block text-body">{t.title}</span>
                    <span className="text-micro text-ink-2">
                      ~{t.minutes} min{t.due ? ` · due ${t.due}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {result.questions.length ? (
            <div className="text-small text-ink-2">
              <p className="font-medium text-ink">Worth deciding</p>
              <ul className="mt-1 list-disc pl-4">
                {result.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setResult(null)}>
              Try again
            </Button>
            <Button
              variant="primary"
              pending={pending}
              disabled={!picked.size}
              onClick={() =>
                start(async () => {
                  let added = 0;
                  for (const i of [...picked].sort((a, b) => a - b)) {
                    const t = result.tasks[i];
                    const r = await createTask({
                      title: t.title,
                      projectId: result.projectId,
                      dueAt: t.due ? localToIso(t.due, "23:59", tz) : null,
                    });
                    if (r.ok) added++;
                  }
                  notify(`Added ${added} task${added === 1 ? "" : "s"}`);
                  onDone();
                })
              }
            >
              Add {picked.size} task{picked.size === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
