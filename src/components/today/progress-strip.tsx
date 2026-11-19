import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatGBP } from "@/lib/money";

type Metric = { label: string; href?: string; value?: string; detail?: string; alert?: string; phase?: string };

/** A single quiet row, not a wall of cards. Areas not built yet say so in small print. */
export function ProgressStrip({
  doneToday,
  doneThisWeek,
  activeGoals,
  quietGoals,
  habitsDone,
  habitsDue,
  activeProjects,
  projectsNeedingAttention,
  money,
  gym,
  className,
}: {
  doneToday: number;
  doneThisWeek: number;
  activeGoals: number;
  quietGoals: number;
  habitsDone: number;
  habitsDue: number;
  activeProjects: number;
  projectsNeedingAttention: number;
  money: { leftThisWeek: number; allowancePerWeek: number } | null;
  gym: { done: number; target: number };
  className?: string;
}) {
  const metrics: Metric[] = [
    { label: "Tasks done", href: "/tasks", value: String(doneToday), detail: `today · ${doneThisWeek} this week` },
    {
      label: "Goals",
      href: "/goals",
      value: String(activeGoals),
      detail: "active",
      alert: quietGoals ? `${quietGoals} quiet for 2+ weeks` : undefined,
    },
    { label: "Habits", href: "/habits", value: habitsDue ? `${habitsDone}/${habitsDue}` : "–", detail: habitsDue ? "logged today" : "none today" },
    {
      label: "Projects",
      href: "/projects",
      value: String(activeProjects),
      detail: "active",
      alert: projectsNeedingAttention ? `${projectsNeedingAttention} need attention` : undefined,
    },
    money
      ? {
          label: "Money",
          href: "/money",
          value: formatGBP(Math.abs(money.leftThisWeek), { whole: true }),
          detail: money.leftThisWeek < 0 ? "over this week" : "left this week",
          alert: money.leftThisWeek < 0 ? `allowance ${formatGBP(money.allowancePerWeek, { whole: true })}` : undefined,
        }
      : { label: "Money", href: "/money", value: "–", detail: "set up your term" },
    { label: "Gym", href: "/body", value: `${gym.done}/${gym.target}`, detail: "this week" },
  ];

  return (
    <section aria-label="Progress" className={cn("border-t border-rule pt-5", className)}>
      <div className="grid grid-cols-6">
        {metrics.map((m, i) => {
          const inner = (
            <>
              <span className="text-small text-ink-2">{m.label}</span>
              <span className="flex flex-col gap-0.5">
                {m.value !== undefined ? (
                  <>
                    <span className="font-display text-h2 leading-none">{m.value}</span>
                    <span className="text-micro text-ink-2">{m.detail}</span>
                    {m.alert ? <span className="text-micro font-medium text-danger">{m.alert}</span> : null}
                  </>
                ) : (
                  <>
                    <span className="font-display text-h2 leading-none text-ink-3" aria-hidden>
                      –
                    </span>
                    <span className="text-micro text-ink-3">Planned · {m.phase}</span>
                  </>
                )}
              </span>
            </>
          );
          const cls = cn("flex flex-col gap-1.5 pr-4", i > 0 && "border-l border-rule pl-4");
          return m.href ? (
            <Link key={m.label} href={m.href} className={cn(cls, "rounded-sm transition-colors hover:bg-sunken/40")}>
              {inner}
            </Link>
          ) : (
            <div key={m.label} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
