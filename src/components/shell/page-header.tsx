import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[880px] px-5 pt-6 sm:px-8 lg:px-12 lg:pt-14", className)}>{children}</div>;
}

export function PageHeader({ title, lede, action }: { title: string; lede?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-h1 font-normal tracking-[-0.02em]">{title}</h1>
        {lede ? <p className="mt-2 max-w-[60ch] text-body text-ink-2">{lede}</p> : null}
      </div>
      {action}
    </header>
  );
}
