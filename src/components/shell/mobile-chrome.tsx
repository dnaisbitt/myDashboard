"use client";

import { Check, House, Inbox, Menu, Plus, Search, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/button";
import { isActive, NAV } from "./nav";
import { useShell } from "./shell-context";
import { Wordmark } from "./wordmark";

/** Phone top bar: wordmark, search, menu (all sections + settings). Deliberately small. */
export function MobileTopBar() {
  return (
    <Suspense fallback={<MobileTopBarInner pathname="" />}>
      <MobileTopBarLive />
    </Suspense>
  );
}

function MobileTopBarLive() {
  return <MobileTopBarInner pathname={usePathname()} />;
}

function MobileTopBarInner({ pathname }: { pathname: string }) {
  const { openSearch, openAssistant } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-rule bg-canvas/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
        <Link href="/" className="mr-auto py-2">
          <Wordmark className="text-[1.25rem]" />
        </Link>
        <IconButton label="Search" onClick={openSearch}>
          <Search size={18} aria-hidden />
        </IconButton>
        <IconButton label="Menu" onClick={() => setMenuOpen(true)}>
          <Menu size={18} aria-hidden />
        </IconButton>
      </header>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Go to">
        <nav aria-label="All sections" className="-mx-2 flex flex-col">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.also);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-sm px-2 text-body",
                  active ? "bg-sunken font-medium" : "text-ink-2",
                )}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.phase ? <span className="text-micro text-ink-3">Planned · {item.phase}</span> : null}
              </Link>
            );
          })}
          <div className="my-2 border-t border-rule" />
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              openAssistant();
            }}
            className="flex h-11 items-center gap-3 rounded-sm px-2 text-left text-body text-ink-2"
          >
            <Sparkles size={18} strokeWidth={1.75} aria-hidden />
            Assistant
          </button>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className="flex h-11 items-center gap-3 rounded-sm px-2 text-body text-ink-2"
          >
            <Settings size={18} strokeWidth={1.75} aria-hidden />
            Settings
          </Link>
        </nav>
      </Dialog>
    </>
  );
}

/** Phone bottom bar: four items. Capture sits in the thumb zone. */
export function MobileBottomBar() {
  return (
    <Suspense fallback={<MobileBottomBarInner pathname="" />}>
      <MobileBottomBarLive />
    </Suspense>
  );
}

function MobileBottomBarLive() {
  return <MobileBottomBarInner pathname={usePathname()} />;
}

function MobileBottomBarInner({ pathname }: { pathname: string }) {
  const { openCapture, openLog } = useShell();

  const tab = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 text-micro transition-colors",
      active ? "font-medium text-ink" : "text-ink-2",
    );

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch px-2">
        <Link href="/" className={tab(pathname === "/")} aria-current={pathname === "/" ? "page" : undefined}>
          <House size={20} strokeWidth={pathname === "/" ? 2 : 1.75} aria-hidden />
          Today
        </Link>
        <Link
          href="/inbox"
          className={tab(pathname.startsWith("/inbox"))}
          aria-current={pathname.startsWith("/inbox") ? "page" : undefined}
        >
          <Inbox size={20} strokeWidth={pathname.startsWith("/inbox") ? 2 : 1.75} aria-hidden />
          Inbox
        </Link>
        <button type="button" onClick={() => openCapture()} className={tab(false)}>
          <span className="grid size-8 place-items-center rounded-full bg-ink text-canvas">
            <Plus size={18} aria-hidden />
          </span>
          Capture
        </button>
        <button type="button" onClick={openLog} className={tab(false)}>
          <Check size={20} strokeWidth={1.75} aria-hidden />
          Log
        </button>
      </div>
    </nav>
  );
}
