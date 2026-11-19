import Link from "next/link";
import type { TodayData } from "@/lib/data/today";
import { counts, isScheduled } from "@/lib/habits";
import { describeDue } from "@/lib/time";
import { Briefing } from "./briefing";
import { Deadlines } from "./deadlines";
import { Decide } from "./decide";
import { HabitsToday } from "./habits-today";
import { Priorities } from "./priorities";
import { ProgressStrip } from "./progress-strip";
import { Schedule } from "./schedule";
import { TodayHeader } from "./today-header";

/** One-line, factual summary built only from real rows (direct tone for deadlines). */
export function summarise(d: TodayData): string[] {
  const tz = d.profile.timezone;
  const out: string[] = [];
  const infos = d.deadlines.map((t) => ({ t, info: describeDue(t.due_at!, t.due_has_time, d.nowMs, tz) }));
  const overdue = infos.filter((x) => x.info.overdue);
  const next = infos.find((x) => !x.info.overdue);
  if (overdue.length) out.push(`${overdue.length} overdue.`);
  if (next) out.push(`${next.t.title}, ${next.info.label.replace(" · ", ", ")}.`);
  const cancelled = d.blocks.filter((b) => b.cancelled);
  if (cancelled.length) out.push(`${cancelled.map((b) => b.title).join(", ")} cancelled today.`);
  if (d.priorities.length === 0) out.push("No priorities picked yet.");
  if (d.quietGoals[0]) out.push(`“${d.quietGoals[0].title}” hasn't moved in ${d.quietGoals[0].quietDays} days.`);
  if (d.money && d.money.leftThisWeek < 0) out.push(`Over this week's budget.`);
  if (d.inboxCount) out.push(`${d.inboxCount} waiting in your Inbox.`);
  return out;
}

export function TodayView({ data, ai }: { data: TodayData; ai: { ready: boolean; message: string } }) {
  const tz = data.profile.timezone;
  // The highlighter is spent once: on the current or next block, else on priority #1.
  const hasUpcomingBlock = data.blocks.some((b) => !b.cancelled && Date.parse(b.endsAt) > data.nowMs);
  const habitsDue = data.habits.filter((h) => isScheduled(h, data.todayKey));
  const habitsDone = habitsDue.filter((h) => counts(data.habitLogs.find((l) => l.habit_id === h.id && l.on_date === data.todayKey))).length;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pt-6 sm:px-8 lg:px-12 lg:pt-14">
      <TodayHeader name={data.profile.display_name} nowMs={data.nowMs} tz={tz} summary={summarise(data)} />

      <div className="mt-10 grid grid-cols-1 gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-12">
          <Priorities
            priorities={data.priorities}
            carryOver={data.carryOver}
            candidates={data.candidates}
            nowMs={data.nowMs}
            tz={tz}
            marked={!hasUpcomingBlock}
          />
          <Schedule blocks={data.blocks} nowMs={data.nowMs} tz={tz} todayKey={data.todayKey} marked={hasUpcomingBlock} />
        </div>
        <div className="flex min-w-0 flex-col gap-12">
          <Deadlines deadlines={data.deadlines} nowMs={data.nowMs} tz={tz} todayKey={data.todayKey} />
          <HabitsToday habits={data.habits} logs={data.habitLogs} todayKey={data.todayKey} />
          {data.meals.dinner || data.meals.lunch ? (
            <p className="-mt-6 text-small text-ink-2">
              {data.meals.lunch ? <>Lunch: {data.meals.lunch.replace(/^Leftover /, "leftover ")}. </> : null}
              {data.meals.dinner ? <>Tonight: {data.meals.dinner}.</> : null}{" "}
              <Link href="/body/meals" className="underline underline-offset-4 hover:text-ink">
                Meals
              </Link>
            </p>
          ) : null}
          {/* Phone stays deliberately small: decisions, briefing and the strip are laptop-only. */}
          <div className="hidden flex-col gap-12 lg:flex">
            <Decide items={data.decisions} nowMs={data.nowMs} tz={tz} />
            <Briefing ready={ai.ready} message={ai.message} />
          </div>
        </div>
      </div>

      <ProgressStrip
        className="mt-14 hidden lg:block"
        doneToday={data.doneToday}
        doneThisWeek={data.doneThisWeek}
        activeGoals={data.activeGoals}
        quietGoals={data.quietGoals.length}
        habitsDone={habitsDone}
        habitsDue={habitsDue.length}
        activeProjects={data.activeProjects}
        projectsNeedingAttention={data.projectsNeedingAttention}
        money={data.money}
        gym={data.gym}
      />
    </div>
  );
}
