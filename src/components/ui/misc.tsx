import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Section heading: sentence case, no eyebrow labels. Optional count and trailing action. */
export function SectionHeader({
  title,
  count,
  action,
  id,
  className,
}: {
  title: string;
  count?: number | string;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-8 items-center gap-2", className)}>
      <h2 id={id} className="text-body font-semibold tracking-[-0.005em]">
        {title}
      </h2>
      {count !== undefined ? <span className="tnum text-small text-ink-3">{count}</span> : null}
      {action ? <div className="ml-auto flex items-center gap-1">{action}</div> : null}
    </div>
  );
}

/** Honest marker for things that are designed but not built yet. */
export function Planned({ phase, className }: { phase: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border border-dashed border-rule-strong px-2 py-px text-micro whitespace-nowrap text-ink-2",
        className,
      )}
    >
      Planned · {phase}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-dashed border-rule px-4 py-4", className)}>
      <p className="text-body font-medium">{title}</p>
      {body ? <p className="mt-1 text-small text-ink-2">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-rule bg-surface px-1 font-sans text-micro text-ink-2">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-sunken", className)} />;
}
