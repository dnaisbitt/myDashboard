import type { Metadata } from "next";
import { Suspense } from "react";
import { WeeklyReview } from "@/components/planner/weekly-review";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { PLANNER_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { getWeeklyReview } from "@/lib/data/review";
import { getClock } from "@/lib/data/viewer";
import { isValidKey, weekStartKey } from "@/lib/time";

export const metadata: Metadata = { title: "Weekly review" };

export default function ReviewPage({ searchParams }: PageProps<"/planner/review">) {
  return (
    <PageFrame className="max-w-[1180px]">
      <PageHeader title="Planner" />
      <LinkTabs items={PLANNER_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <ReviewContent searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function ReviewContent({ searchParams }: { searchParams: PageProps<"/planner/review">["searchParams"] }) {
  const sp = await searchParams;
  const { todayKey } = await getClock();
  const current = weekStartKey(todayKey);
  const requested = typeof sp.week === "string" && isValidKey(sp.week) ? weekStartKey(sp.week) : current;
  const r = await getWeeklyReview(requested > current ? current : requested);
  return <WeeklyReview r={r} />;
}
