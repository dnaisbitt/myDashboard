import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { BODY_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { Training } from "@/components/body/training";
import { getBody } from "@/lib/data/life";

export const metadata: Metadata = { title: "Training" };

export default function Page() {
  return (
    <PageFrame className="max-w-[1120px]">
      <PageHeader title="Body" />
      <LinkTabs items={BODY_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Content />
      </Suspense>
    </PageFrame>
  );
}

async function Content() {
  const d = await getBody();
  return (
    <Training
      profile={d.profile}
      todayKey={d.todayKey}
      weekStart={d.weekStart}
      weekBlocks={d.weekBlocks}
      nextWeekBlocks={d.nextWeekBlocks}
      workouts={d.workouts}
      booked={d.booked}
      weights={d.weights}
      lifts={d.lifts}
      tz={d.tz}
    />
  );
}
