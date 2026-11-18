"use client";

import { Plus, Search, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "@/components/ui/misc";
import { isActive, NAV } from "./nav";
import { useShell } from "./shell-context";
import { Wordmark } from "./wordmark";

/** The current path is request-time data; render without a highlight until it streams in. */
export function Sidebar() {
  return (
    <Suspense fallback={<SidebarInner pathname="" />}>
      <SidebarLive />
    </Suspense>
  );
}

function SidebarLive() {
  return <SidebarInner pathname={usePathname()} />;
}

function SidebarInner({ pathname }: { pathname: string }) {
  const { openCapture, openSearch, openAssistant, viewer } = useShell();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-rule px-3 pt-6 pb-4 lg:flex">
      <Link href="/" className="mb-6 px-2.5 py-1">
        <Wordmark />
      </Link>

      <div className="flex flex-col gap-1.5 px-0.5">
        <button
          type="button"
          onClick={() => openCapture()}
          className="flex h-9 items-center gap-2 rounded-sm bg-ink px-3 text-small font-medium text-canvas transition-colors hover:bg-ink/85"
        >
          <Plus size={15} aria-hidden />
          Capture
          <span className="ml-auto rounded-[4px] border border-canvas/25 px-1.5 text-micro text-canvas/70">N</span>
        </button>
        <button
          type="button"
          onClick={openSearch}
          className="flex h-9 items-center gap-2 rounded-sm px-3 text-small text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
        >
          <Search size={15} aria-hidden />
          Search
          <span className="ml-auto">
            <Kbd>Ctrl K</Kbd>
          </span>
        </button>
      </div>

      <nav aria-label="Sections" className="mt-6 flex flex-col gap-px">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, item.also);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-9 items-center gap-2.5 rounded-sm px-3 text-small transition-colors",
                active ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:bg-sunken/60 hover:text-ink",
              )}
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.75} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.phase ? (
                <span className="text-micro text-ink-3" title={`Planned · ${item.phase}`}>
                  {item.phase.replace("Phase ", "P")}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-px border-t border-rule pt-3">
        <button
          type="button"
          onClick={openAssistant}
          className="flex h-9 items-center gap-2.5 rounded-sm px-3 text-small text-ink-2 transition-colors hover:bg-sunken/60 hover:text-ink"
        >
          <Sparkles size={16} strokeWidth={1.75} aria-hidden />
          <span className="flex-1 text-left">Assistant</span>
          <span className="text-micro text-ink-3">{viewer.aiReady ? "On" : "Off"}</span>
        </button>
        <Link
          href="/settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-sm px-3 text-small transition-colors",
            pathname === "/settings" ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:bg-sunken/60 hover:text-ink",
          )}
        >
          <Settings size={16} strokeWidth={1.75} aria-hidden />
          Settings
        </Link>
      </div>
    </aside>
  );
}
