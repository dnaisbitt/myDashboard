import { cn } from "@/lib/cn";

type Metric = { label: string; value?: string; detail?: string; phase?: string };

/** A single quiet row, not a wall of cards. Areas not built yet say so in small print. */
export function ProgressStrip({
  doneToday,
  doneThisWeek,
  activeGoals,
  activeProjects,
  className,
}: {
  doneToday: number;
  doneThisWeek: number;
  activeGoals: number;
  activeProjects: number;
  className?: string;
}) {
  const metrics: Metric[] = [
    { label: "Tasks done", value: String(doneToday), detail: `today · ${doneThisWeek} this week` },
    activeGoals ? { label: "Goals", value: String(activeGoals), detail: "active" } : { label: "Goals", phase: "Phase 4" },
    { label: "Habits", phase: "Phase 4" },
    activeProjects ? { label: "Projects", value: String(activeProjects), detail: "active" } : { label: "Projects", phase: "Phase 4" },
    { label: "Money", phase: "Phase 5" },
    { label: "Body", phase: "Phase 5" },
  ];

  return (
    <section aria-label="Progress" className={cn("border-t border-rule pt-5", className)}>
      <dl className="grid grid-cols-6">
        {metrics.map((m, i) => (
          <div key={m.label} className={cn("flex flex-col gap-1.5 pr-4", i > 0 && "border-l border-rule pl-4")}>
            <dt className="text-small text-ink-2">{m.label}</dt>
            <dd className="flex flex-col gap-0.5">
              {m.value !== undefined ? (
                <>
                  <span className="font-display text-h2 leading-none">{m.value}</span>
                  <span className="text-micro text-ink-2">{m.detail}</span>
                </>
              ) : (
                <>
                  <span className="font-display text-h2 leading-none text-ink-3" aria-hidden>
                    –
                  </span>
                  <span className="text-micro text-ink-3">Planned · {m.phase}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
