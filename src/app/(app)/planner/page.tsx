import type { Metadata } from "next";
import { Suspense } from "react";
import { PlannerView, type PlannerViewName } from "@/components/planner/planner-view";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { PLANNER_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { getOverdue, getRange } from "@/lib/data/planner";
import { getClock } from "@/lib/data/viewer";
import { addDaysToKey, isValidKey, monthStartKey, weekStartKey } from "@/lib/time";

export const metadata: Metadata = { title: "Planner" };

export default function PlannerPage({ searchParams }: PageProps<"/planner">) {
  return (
    <PageFrame className="max-w-[1180px]">
      <PageHeader title="Planner" />
      <LinkTabs items={PLANNER_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <PlannerContent searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function PlannerContent({ searchParams }: { searchParams: PageProps<"/planner">["searchParams"] }) {
  const sp = await searchParams;
  const { profile, nowMs, todayKey } = await getClock();
  const rawView = typeof sp.view === "string" ? sp.view : "week";
  const view: PlannerViewName = rawView === "day" || rawView === "month" ? rawView : "week";
  const anchor = typeof sp.date === "string" && isValidKey(sp.date) ? sp.date : todayKey;

  let from = anchor;
  let to = anchor;
  if (view === "week") {
    from = weekStartKey(anchor);
    to = addDaysToKey(from, 6);
  } else if (view === "month") {
    from = weekStartKey(monthStartKey(anchor));
    to = addDaysToKey(from, 41);
  }

  const [range, overdue] = await Promise.all([getRange(from, to), getOverdue(todayKey)]);
  return (
    <PlannerView
      view={view}
      anchor={anchor}
      todayKey={todayKey}
      blocks={range.blocks}
      tasks={range.tasks}
      overdue={overdue}
      tz={profile.timezone}
      nowMs={nowMs}
    />
  );
}
