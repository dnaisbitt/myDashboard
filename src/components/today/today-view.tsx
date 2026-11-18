import type { TodayData } from "@/lib/data/today";
import { describeDue } from "@/lib/time";
import { Briefing } from "./briefing";
import { Deadlines } from "./deadlines";
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
  if (d.priorities.length === 0) out.push("No priorities picked yet.");
  if (d.inboxCount) out.push(`${d.inboxCount} waiting in your Inbox.`);
  return out;
}

export function TodayView({ data, ai }: { data: TodayData; ai: { ready: boolean; message: string } }) {
  const tz = data.profile.timezone;
  // The highlighter is spent once: on the current or next block, else on priority #1.
  const hasUpcomingBlock = data.events.some((e) => new Date(e.ends_at).getTime() > data.nowMs);

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
          <Schedule events={data.events} nowMs={data.nowMs} tz={tz} todayKey={data.todayKey} marked={hasUpcomingBlock} />
        </div>
        <div className="flex min-w-0 flex-col gap-12">
          <Deadlines deadlines={data.deadlines} nowMs={data.nowMs} tz={tz} todayKey={data.todayKey} />
          {/* Phone stays deliberately small: the briefing and strip are laptop-only. */}
          <div className="hidden lg:block">
            <Briefing ready={ai.ready} message={ai.message} />
          </div>
        </div>
      </div>

      <ProgressStrip
        className="mt-14 hidden lg:block"
        doneToday={data.doneToday}
        doneThisWeek={data.doneThisWeek}
        activeGoals={data.activeGoals}
        activeProjects={data.activeProjects}
      />
    </div>
  );
}
