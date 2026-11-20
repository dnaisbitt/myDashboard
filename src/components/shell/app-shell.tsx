"use client";

import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { ToastProvider } from "@/components/ui/toast";
import type { Task } from "@/lib/types";
import { AssistantDrawer } from "./assistant-drawer";
import { CaptureDialog } from "./capture-dialog";
import { LogSheet } from "./log-sheet";
import { MobileBottomBar, MobileTopBar } from "./mobile-chrome";
import { SearchDialog } from "./search-dialog";
import { defaultViewer, ShellContext, type ShellApi, type ViewerInfo } from "./shell-context";
import { Sidebar } from "./sidebar";

type Overlay = null | "capture" | "search" | "assistant" | "log";

function isTyping(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function AppShell({ children, bridge }: { children: ReactNode; bridge: ReactNode }) {
  const [viewer, setViewer] = useState<ViewerInfo>(defaultViewer);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [captureAsPriority, setCaptureAsPriority] = useState(false);
  const [task, setTask] = useState<Task | null>(null);

  const api = useMemo<ShellApi>(
    () => ({
      viewer,
      setViewer,
      openCapture: (opts) => {
        setCaptureAsPriority(Boolean(opts?.asPriority));
        setOverlay("capture");
      },
      openSearch: () => setOverlay("search"),
      openAssistant: () => setOverlay("assistant"),
      openLog: () => setOverlay("log"),
      openTask: (t) => {
        setOverlay(null);
        setTask(t);
      },
    }),
    [viewer],
  );

  // Service worker: receives reminders. No caching, so data is never stale.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // PWA shortcut / deep link: /?capture=1 opens capture straight away.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("capture") === "1") {
      url.searchParams.delete("capture");
      window.history.replaceState(null, "", url.pathname + url.search);
      const t = window.setTimeout(() => setOverlay("capture"), 0);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Keyboard: N = capture, Ctrl/⌘ K = search, "." = assistant.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOverlay("search");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        api.openCapture();
      } else if (e.key === ".") {
        e.preventDefault();
        setOverlay("assistant");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  const close = () => setOverlay(null);

  return (
    <ShellContext value={api}>
      <ToastProvider>
        {bridge}
        <a
          href="#main"
          className="sr-only z-50 rounded-sm bg-ink px-3 py-2 text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileTopBar />
            <main id="main" className="flex-1 pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-16">
              {children}
            </main>
          </div>
        </div>
        <MobileBottomBar />

        <CaptureDialog open={overlay === "capture"} onClose={close} tz={viewer.tz} initialAsPriority={captureAsPriority} />
        <SearchDialog open={overlay === "search"} onClose={close} onPick={api.openTask} tz={viewer.tz} />
        <AssistantDrawer open={overlay === "assistant"} onClose={close} ready={viewer.aiReady} message={viewer.aiMessage} tz={viewer.tz} />
        <LogSheet open={overlay === "log"} onClose={close} />
        <TaskDialog task={task} onClose={() => setTask(null)} tz={viewer.tz} />
      </ToastProvider>
    </ShellContext>
  );
}

/** Rendered inside a Suspense boundary by the server layout once the profile is known. */
export function ViewerSync({ viewer }: { viewer: ViewerInfo }) {
  const ctx = useContext(ShellContext);
  useEffect(() => {
    ctx?.setViewer(viewer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.tz, viewer.name, viewer.aiReady, viewer.aiMessage]);
  return null;
}
