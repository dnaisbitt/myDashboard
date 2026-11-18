"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Segmented } from "@/components/ui/segmented";

type Theme = "system" | "light" | "dark";
const KEY = "lifeos-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  const t = localStorage.getItem(KEY);
  return t === "light" || t === "dark" ? t : "system";
}

function write(t: Theme) {
  if (t === "system") {
    localStorage.removeItem(KEY);
    delete document.documentElement.dataset.theme;
  } else {
    localStorage.setItem(KEY, t);
    document.documentElement.dataset.theme = t;
  }
  listeners.forEach((l) => l());
}

export function ThemeControl() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "system" as Theme,
  );

  return (
    <Segmented<Theme>
      label="Theme"
      value={theme}
      onChange={write}
      options={[
        { value: "system", label: "System", icon: <Monitor size={14} aria-hidden /> },
        { value: "light", label: "Light", icon: <Sun size={14} aria-hidden /> },
        { value: "dark", label: "Dark", icon: <Moon size={14} aria-hidden /> },
      ]}
    />
  );
}
