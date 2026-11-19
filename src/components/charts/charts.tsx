"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Small, single-series charts in the house style: ink marks, hairline grid,
 * 4px rounded data-ends, ≤24px bars, hover + keyboard tooltips, and a table view.
 * No colour encoding beyond ink; status (over budget) adds a label, never colour alone.
 */

type TableRow = { label: string; value: string };

export function ChartFrame({
  title,
  subtitle,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  table: { columns: [string, string]; rows: TableRow[] };
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure className={cn("flex flex-col gap-3", className)} aria-labelledby={`${id}-t`}>
      <figcaption className="flex items-baseline gap-3">
        <span id={`${id}-t`} className="text-body font-semibold">
          {title}
        </span>
        {subtitle ? <span className="text-small text-ink-2">{subtitle}</span> : null}
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="ml-auto text-micro text-ink-2 underline-offset-4 hover:text-ink hover:underline"
        >
          {asTable ? "Show chart" : "Show table"}
        </button>
      </figcaption>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto rounded-md border border-rule">
          <table className="w-full text-small">
            <thead className="sticky top-0 bg-surface text-left text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">{table.columns[0]}</th>
                <th className="px-3 py-2 text-right font-medium">{table.columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-rule">
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className="px-3 py-1.5 text-right">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// ---------------------------------------------------------------------------

export type Column = { key: string; label: string; short: string; value: number; display: string; flag?: string; current?: boolean };

/** Vertical columns with an optional reference line (e.g. weekly allowance). */
export function ColumnChart({
  data,
  reference,
  format,
  height = 160,
}: {
  data: Column[];
  reference?: { value: number; label: string };
  format: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), reference?.value ?? 0, 1));
  const ticks = [0, max / 2, max];
  const active = data.find((d) => d.key === hover);

  return (
    <div className="relative">
      <div className="flex">
        <div className="relative w-12 shrink-0" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2 text-micro text-ink-3" style={{ top: height - (t / max) * height }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 border-t border-rule" style={{ top: height - (t / max) * height }} />
          ))}
          {reference && reference.value > 0 ? (
            <div aria-hidden className="absolute inset-x-0 z-10 border-t border-ink-2" style={{ top: height - (reference.value / max) * height }}>
              <span className="absolute -top-4 right-0 bg-canvas pl-1 text-micro text-ink-2">{reference.label}</span>
            </div>
          ) : null}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d) => (
              <div key={d.key} className="flex h-full flex-1 items-end justify-center">
                <button
                  type="button"
                  aria-label={`${d.label}: ${d.display}${d.flag ? `, ${d.flag}` : ""}`}
                  onMouseEnter={() => setHover(d.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(d.key)}
                  onBlur={() => setHover(null)}
                  className="group flex h-full w-full max-w-6 items-end focus-visible:outline-offset-1"
                >
                  <span
                    className={cn(
                      "block w-full rounded-t-[4px] transition-opacity",
                      d.current ? "bg-ink" : "bg-ink/55",
                      hover && hover !== d.key && "opacity-50",
                    )}
                    style={{ height: Math.max(d.value > 0 ? 2 : 0, (d.value / max) * height) }}
                  />
                </button>
              </div>
            ))}
          </div>
          {active ? (
            <div className="pointer-events-none absolute -top-2 left-1/2 z-20 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-2.5 py-1.5 text-micro whitespace-nowrap text-canvas shadow-float">
              {active.label} · <span className="font-medium">{active.display}</span>
              {active.flag ? ` · ${active.flag}` : ""}
            </div>
          ) : null}
        </div>
      </div>
      <div className="ml-12 flex gap-[2px] pt-1.5" aria-hidden>
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 truncate text-center text-micro text-ink-3">
            {data.length <= 8 || i % Math.ceil(data.length / 8) === 0 ? d.short : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Horizontal bars, value at the tip. For "spend by category". */
export function BarList({ data, format }: { data: Array<{ label: string; value: number }>; format: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[104px_1fr] items-center gap-3 text-small">
          <span className="truncate text-ink-2">{d.label}</span>
          <span className="flex items-center gap-2">
            <span className="block h-3 max-w-[calc(100%-72px)] rounded-r-[4px] bg-ink/70" style={{ width: `${(d.value / max) * 100}%` }} aria-hidden />
            <span className="shrink-0">{format(d.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

export type Point = { key: string; x: number; y: number; label: string; display: string };

/** One 2px line with ≥8px end-markers and a nearest-point tooltip. x/y are data units. */
export function LineChart({
  points,
  format,
  height = 160,
  xLabels,
}: {
  points: Point[];
  format: (v: number) => string;
  height?: number;
  xLabels: Array<{ x: number; label: string }>;
}) {
  const [hover, setHover] = useState<Point | null>(null);
  if (!points.length) return null;
  points = [...points].sort((a, b) => a.x - b.x);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs, xMin + 1);
  const pad = Math.max(1, (Math.max(...ys) - Math.min(...ys)) * 0.15);
  const yMin = Math.floor(Math.min(...ys) - pad);
  const yMax = Math.ceil(Math.max(...ys) + pad);
  const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * 100;
  const sy = (y: number) => 100 - ((y - yMin) / (yMax - yMin)) * 100;
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const last = points[points.length - 1];

  return (
    <div className="flex">
      <div className="relative w-12 shrink-0" style={{ height }} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-2 -translate-y-1/2 text-micro text-ink-3" style={{ top: `${sy(t)}%` }}>
            {format(t)}
          </span>
        ))}
      </div>
      <div className="flex-1">
        <div
          className="relative"
          style={{ height }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = xMin + ((e.clientX - r.left) / r.width) * (xMax - xMin);
            setHover(points.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)));
          }}
        >
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 border-t border-rule" style={{ top: `${sy(t)}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <polyline
              points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {[last, ...(hover && hover !== last ? [hover] : [])].map((p) => (
            <span
              key={p.key}
              aria-hidden
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_2px_var(--canvas)]"
              style={{ left: `${sx(p.x)}%`, top: `${sy(p.y)}%` }}
            />
          ))}
          <span
            className="absolute -translate-x-full -translate-y-[160%] text-small font-medium whitespace-nowrap"
            style={{ left: `${sx(last.x)}%`, top: `${sy(last.y)}%` }}
          >
            {last.display}
          </span>
          {hover ? (
            <>
              <div aria-hidden className="absolute inset-y-0 border-l border-ink-3" style={{ left: `${sx(hover.x)}%` }} />
              <div
                className="pointer-events-none absolute -top-2 z-20 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-2.5 py-1.5 text-micro whitespace-nowrap text-canvas shadow-float"
                style={{ left: `${sx(hover.x)}%` }}
              >
                {hover.label} · <span className="font-medium">{hover.display}</span>
              </div>
            </>
          ) : null}
        </div>
        <div className="relative h-5" aria-hidden>
          {xLabels.map((l) => (
            <span
              key={l.x}
              className={cn(
                "absolute pt-1.5 text-micro whitespace-nowrap text-ink-3",
                sx(l.x) < 10 ? "" : sx(l.x) > 90 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${sx(l.x)}%` }}
            >
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export type Night = { key: string; label: string; short: string; bed: number | null; wake: number | null; display: string };

/**
 * Sleep as a column per night from bedtime down to wake time.
 * Vertical axis: 20:00 at the top to 12:00 next day at the bottom (minutes after 18:00: 120–1080).
 */
export function SleepChart({ nights, target, height = 200 }: { nights: Night[]; target?: { minutes: number; label: string }; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const TOP = 120;
  const BOTTOM = 1080;
  const y = (m: number) => ((Math.min(BOTTOM, Math.max(TOP, m)) - TOP) / (BOTTOM - TOP)) * height;
  const ticks = [240, 360, 480, 600, 720, 840, 960].map((m) => ({ m, l: `${String(((18 * 60 + m) / 60) % 24).padStart(2, "0")}:00` }));
  const active = nights.find((n) => n.key === hover);

  return (
    <div className="flex">
      <div className="relative w-12 shrink-0" style={{ height }} aria-hidden>
        {ticks.map((t) => (
          <span key={t.m} className="absolute right-2 -translate-y-1/2 text-micro text-ink-3" style={{ top: y(t.m) }}>
            {t.l}
          </span>
        ))}
      </div>
      <div className="flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t.m} aria-hidden className="absolute inset-x-0 border-t border-rule" style={{ top: y(t.m) }} />
          ))}
          {target ? (
            <div aria-hidden className="absolute inset-x-0 z-10 border-t border-ink-2" style={{ top: y(target.minutes) }}>
              <span className="absolute -top-4 right-0 bg-canvas pl-1 text-micro text-ink-2">{target.label}</span>
            </div>
          ) : null}
          <div className="absolute inset-0 flex gap-[2px]">
            {nights.map((n) => {
              const has = n.bed !== null && n.wake !== null;
              const top = n.bed !== null ? y(n.bed) : 0;
              // Wake is a next-morning clock time; +6h converts it to "minutes after 18:00 the evening before".
              const bottom = n.wake !== null ? y(n.wake + 6 * 60) : 0;
              return (
                <div key={n.key} className="relative flex-1">
                  <button
                    type="button"
                    aria-label={`${n.label}: ${n.display}`}
                    onMouseEnter={() => setHover(n.key)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(n.key)}
                    onBlur={() => setHover(null)}
                    className="absolute inset-0 mx-auto max-w-6 focus-visible:outline-offset-1"
                  >
                    {has ? (
                      <span
                        className={cn("absolute inset-x-0 rounded-[4px] bg-ink/70 transition-opacity", hover && hover !== n.key && "opacity-40")}
                        style={{ top, height: Math.max(4, bottom - top) }}
                      />
                    ) : n.bed !== null ? (
                      <span className="absolute inset-x-0 h-1 rounded-full bg-ink/70" style={{ top }} />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
          {active ? (
            <div className="pointer-events-none absolute -top-2 left-1/2 z-20 -translate-x-1/2 -translate-y-full rounded-sm bg-ink px-2.5 py-1.5 text-micro whitespace-nowrap text-canvas shadow-float">
              {active.label} · <span className="font-medium">{active.display}</span>
            </div>
          ) : null}
        </div>
        <div className="flex gap-[2px] pt-1.5" aria-hidden>
          {nights.map((n, i) => (
            <span key={n.key} className="flex-1 truncate text-center text-micro text-ink-3">
              {nights.length <= 10 || i % Math.ceil(nights.length / 10) === 0 ? n.short : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
