"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTime, greetingFor, localHour, longDateParts } from "@/lib/time";

/** The one bold typographic moment: the date, set large in the serif. */
export function TodayHeader({
  name,
  nowMs,
  tz,
  summary,
}: {
  name: string | null;
  nowMs: number;
  tz: string;
  summary: string[];
}) {
  const now = useMinuteClock(nowMs);
  const { weekday, day, month } = longDateParts(now, tz);
  const greeting = greetingFor(localHour(now, tz));

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 text-body text-ink-2">
        <p>
          {greeting}
          {name ? <>, {name}</> : null}
          {!name ? (
            <>
              {" · "}
              <Link href="/settings" className="underline decoration-rule-strong underline-offset-4 hover:text-ink">
                add your name
              </Link>
            </>
          ) : null}
        </p>
        <time
          className="ml-auto font-medium text-ink"
          dateTime={new Date(now).toISOString()}
          suppressHydrationWarning
          aria-label={`Time ${formatTime(now, tz)}`}
        >
          {formatTime(now, tz)}
        </time>
      </div>
      <h1 className="font-display text-[clamp(2.5rem,7vw,var(--text-display))] leading-[0.95] font-normal tracking-[-0.025em] [font-optical-sizing:auto]">
        {weekday}
        <span className="text-ink-2 italic"> {day} {month}</span>
      </h1>
      {summary.length ? <p className="max-w-[56ch] text-lead text-ink-2">{summary.join(" ")}</p> : null}
    </header>
  );
}

/** Re-renders on each minute boundary. Starts from the server's time to avoid a hydration mismatch. */
export function useMinuteClock(initialMs: number) {
  const [now, setNow] = useState(initialMs);
  useEffect(() => {
    let interval: number | undefined;
    const tick = () => setNow(Date.now());
    tick();
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return now;
}
