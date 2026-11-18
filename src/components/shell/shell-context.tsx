"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TZ } from "@/lib/time";
import type { Task } from "@/lib/types";

export type ViewerInfo = {
  tz: string;
  name: string | null;
  aiReady: boolean;
  aiMessage: string;
};

export const defaultViewer: ViewerInfo = {
  tz: DEFAULT_TZ,
  name: null,
  aiReady: false,
  aiMessage: "Checking assistant status…",
};

export type ShellApi = {
  viewer: ViewerInfo;
  setViewer: (v: ViewerInfo) => void;
  openCapture: (opts?: { asPriority?: boolean }) => void;
  openSearch: () => void;
  openAssistant: () => void;
  openTask: (task: Task) => void;
  openLog: () => void;
};

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside AppShell");
  return ctx;
}
