"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Underlined text tabs: section-level navigation (links). */
type TabItem = { href: string; label: string; match?: string };

export function LinkTabs(props: { items: TabItem[]; className?: string }) {
  return (
    <Suspense fallback={<LinkTabsInner {...props} pathname="" />}>
      <LinkTabsLive {...props} />
    </Suspense>
  );
}

function LinkTabsLive(props: { items: TabItem[]; className?: string }) {
  return <LinkTabsInner {...props} pathname={usePathname()} />;
}

function LinkTabsInner({ items, className, pathname }: { items: TabItem[]; className?: string; pathname: string }) {
  return (
    <nav aria-label="Section" className={cn("flex gap-5 border-b border-rule", className)}>
      {items.map((it) => {
        const active = pathname === it.href || (it.match ? pathname.startsWith(`${it.match}/`) : false);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-body transition-colors",
              active ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** In-page view switcher (state, not navigation). */
export function ViewTabs<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: string; count?: number; tone?: "danger" }>;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-5 overflow-x-auto border-b border-rule">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "-mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 text-small transition-colors",
              active ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {it.label}
            {it.count !== undefined ? (
              <span className={cn("tnum text-micro", active ? "text-ink-2" : it.tone === "danger" && it.count ? "text-danger" : "text-ink-3")}>
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-sunken", className)}
    >
      <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out-soft" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Chip({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "danger" | "muted"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border px-1.5 text-micro leading-[1.15rem] whitespace-nowrap",
        tone === "danger" ? "border-danger/40 text-danger" : tone === "muted" ? "border-transparent px-0 text-ink-3" : "border-rule-strong text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
