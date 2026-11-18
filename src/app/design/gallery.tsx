"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Wordmark } from "@/components/shell/wordmark";
import { ThemeControl } from "@/components/theme/theme-control";
import { Button } from "@/components/ui/button";
import { TaskCheck } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, Kbd, Planned, SectionHeader, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { ToastProvider, useToast } from "@/components/ui/toast";

const SWATCHES = [
  ["Fog", "--canvas", "Canvas"],
  ["Sheet", "--surface", "Floating surfaces"],
  ["Ink", "--ink", "Text, primary action"],
  ["Graphite", "--ink-2", "Secondary text"],
  ["Rule", "--rule", "Hairlines"],
  ["Highlighter", "--mark", "Now / the one thing"],
  ["Brick", "--danger", "Overdue, destructive"],
] as const;

const TYPE = [
  ["Display · Newsreader", "font-display text-display tracking-[-0.025em]", "Wednesday"],
  ["H1 · Newsreader", "font-display text-h1 tracking-[-0.02em]", "Tasks & Projects"],
  ["H2 · Newsreader", "font-display text-h2", "42"],
  ["Title · Schibsted Grotesk 600", "text-title font-semibold", "Edit task"],
  ["Lead", "text-lead text-ink-2", "Coursework 2, Fri 17:00, in 2 days."],
  ["Body", "text-body", "10 past-paper questions on Chapter 4"],
  ["Small", "text-small text-ink-2", "Captured 3 days ago"],
  ["Micro", "text-micro text-ink-3", "Planned · Phase 4"],
] as const;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-rule py-8 md:grid-cols-[180px_1fr]">
      <h2 className="text-body font-semibold">{title}</h2>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

export function Gallery() {
  return (
    <ToastProvider>
      <GalleryBody />
    </ToastProvider>
  );
}

function GalleryBody() {
  const [checked, setChecked] = useState(false);
  const [on, setOn] = useState(true);
  const [tone, setTone] = useState<"gentle" | "direct" | "quiet">("gentle");
  const [confirm, setConfirm] = useState(false);
  const { notify } = useToast();

  return (
    <main className="mx-auto max-w-[960px] px-6 py-12">
      <div className="flex flex-wrap items-center gap-4">
        <Wordmark className="text-[1.75rem]" />
        <span className="text-small text-ink-2">Design system · dev only</span>
        <div className="ml-auto">
          <ThemeControl />
        </div>
      </div>
      <p className="mt-3 text-small text-ink-2">
        <Link className="underline underline-offset-4" href="/design/today">
          Today (fixture)
        </Link>
        {" · "}
        <Link className="underline underline-offset-4" href="/design/today?empty">
          Today (empty)
        </Link>
      </p>

      <Block title="Palette">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map(([name, v, role]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className="h-16 rounded-md border border-rule" style={{ background: `var(${v})` }} />
              <div>
                <p className="text-small font-medium">{name}</p>
                <p className="text-micro text-ink-2">{role}</p>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type">
        {TYPE.map(([label, cls, sample]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-micro text-ink-3">{label}</span>
            <span className={cls}>{sample}</span>
          </div>
        ))}
        <p className="tnum text-body">Tabular (counts and money only; clock times use proportional figures): £1,204.50 · 128 · 42</p>
      </Block>

      <Block title="Actions">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Save</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Delete…
          </Button>
          <Button variant="primary" pending>
            Saving
          </Button>
          <Button size="sm" onClick={() => notify("Task added")}>
            Toast
          </Button>
          <Button size="sm" onClick={() => notify("Task deleted", { action: { label: "Undo", run: () => notify("Restored") } })}>
            Toast with undo
          </Button>
          <Kbd>N</Kbd>
          <Kbd>Ctrl K</Kbd>
        </div>
      </Block>

      <Block title="Controls">
        <div className="flex flex-wrap items-center gap-6">
          <span className="flex items-center gap-3">
            <TaskCheck checked={checked} onChange={setChecked} label="Example task" />
            <span className={checked ? "text-ink-3 line-through" : ""}>Click to complete</span>
          </span>
          <TaskCheck checked={false} onChange={() => {}} label="Overdue example" tone="danger" />
          <Switch checked={on} onChange={setOn} label="Example switch" />
          <Segmented
            label="Tone"
            value={tone}
            onChange={setTone}
            options={[
              { value: "gentle", label: "Gentle" },
              { value: "direct", label: "Direct" },
              { value: "quiet", label: "Quiet" },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" hint="Helpful hint text">
            {(id, d) => <Input id={id} aria-describedby={d} placeholder="Placeholder" />}
          </Field>
          <Field label="With error" error="It has to end after it starts.">
            {(id, d) => <Input id={id} aria-describedby={d} aria-invalid defaultValue="11:00" />}
          </Field>
        </div>
      </Block>

      <Block title="Structure">
        <SectionHeader title="Deadlines" count="2 overdue" action={<Planned phase="Phase 4" />} />
        <EmptyState
          title="No deadlines in the next 7 days"
          body="Capture one in plain words, like “essay due 12 Dec 9am”."
          action={<Button size="sm">Capture</Button>}
        />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11 w-2/3" />
        </div>
      </Block>

      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          notify("Deleted");
        }}
        title="Delete this task?"
        body="“Return library books” will be removed. You can undo straight after."
      />
    </main>
  );
}
