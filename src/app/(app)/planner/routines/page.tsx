import type { Metadata } from "next";
import { Suspense } from "react";
import { RoutinesView } from "@/components/planner/routines-view";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { PLANNER_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { getFocusStats } from "@/lib/data/planner";
import { getHabits } from "@/lib/data/plans";
import { getProfile } from "@/lib/data/viewer";

export const metadata: Metadata = { title: "Routines & focus" };

export default function RoutinesPage() {
  return (
    <PageFrame className="max-w-[1180px]">
      <PageHeader title="Planner" />
      <LinkTabs items={PLANNER_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <RoutinesContent />
      </Suspense>
    </PageFrame>
  );
}

async function RoutinesContent() {
  const [profile, habits, focus] = await Promise.all([getProfile(), getHabits(), getFocusStats()]);
  return <RoutinesView profile={profile} habits={habits.habits} logs={habits.logs} focus={focus} todayKey={habits.todayKey} />;
}
