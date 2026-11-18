import type { Metadata } from "next";
import { Suspense } from "react";
import { TimetableEditor } from "@/components/planner/timetable-editor";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { PLANNER_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { getTimetable } from "@/lib/data/planner";
import { getClock } from "@/lib/data/viewer";

export const metadata: Metadata = { title: "Timetable" };

export default function TimetablePage() {
  return (
    <PageFrame className="max-w-[1180px]">
      <PageHeader title="Planner" />
      <LinkTabs items={PLANNER_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <TimetableContent />
      </Suspense>
    </PageFrame>
  );
}

async function TimetableContent() {
  const [sessions, clock] = await Promise.all([getTimetable(), getClock()]);
  return <TimetableEditor sessions={sessions} todayKey={clock.todayKey} tz={clock.tz} />;
}
