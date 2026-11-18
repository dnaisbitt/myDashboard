import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalsOverview } from "@/components/plans/goals-overview";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { GOAL_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { getGoals } from "@/lib/data/plans";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <PageFrame>
      <PageHeader title="Goals & Habits" />
      <LinkTabs items={GOAL_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <GoalsContent />
      </Suspense>
    </PageFrame>
  );
}

async function GoalsContent() {
  return <GoalsOverview goals={await getGoals()} />;
}
