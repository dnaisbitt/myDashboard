"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { TodayView } from "@/components/today/today-view";
import { buildFixture } from "../fixture";

export function FixtureToday() {
  const [state, setState] = useState<{ now: number; empty: boolean } | null>(null);
  useEffect(() => {
    // Client-only so the fixture is built around the real current time.
    const t = window.setTimeout(() =>
      setState({ now: Date.now(), empty: new URLSearchParams(window.location.search).has("empty") }),
    );
    return () => window.clearTimeout(t);
  }, []);

  return (
    <AppShell bridge={null}>
      <div className="border-b border-dashed border-rule-strong bg-sunken/60 px-5 py-2 text-center text-micro text-ink-2">
        Design fixture for layout review only. Not your data, and actions here won&apos;t save.
      </div>
      {state ? (
        <TodayView
          data={buildFixture(state.now, { empty: state.empty })}
          ai={{ ready: false, message: "The assistant is off. It can be switched on in Settings once a provider key is added on the server." }}
        />
      ) : null}
    </AppShell>
  );
}
