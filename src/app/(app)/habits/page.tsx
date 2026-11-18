import type { Metadata } from "next";
import { Suspense } from "react";
import { HabitsBoard } from "@/components/plans/habits-board";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { GOAL_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { getHabits } from "@/lib/data/plans";

export const metadata: Metadata = { title: "Habits" };

export default function HabitsPage() {
  return (
    <PageFrame>
      <PageHeader title="Goals & Habits" />
      <LinkTabs items={GOAL_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <HabitsContent />
      </Suspense>
    </PageFrame>
  );
}

async function HabitsContent() {
  const d = await getHabits(true);
  return <HabitsBoard habits={d.habits} logs={d.logs} goals={d.goals} todayKey={d.todayKey} />;
}
