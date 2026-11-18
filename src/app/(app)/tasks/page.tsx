import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { TaskBoard } from "@/components/tasks/task-board";
import { TASK_TABS } from "@/components/shell/section-tabs";
import { LinkTabs } from "@/components/ui/tabs";
import { getTaskBoard } from "@/lib/data/tasks";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <PageFrame>
      <PageHeader title="Tasks & Projects" />
      <LinkTabs items={TASK_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <TasksContent />
      </Suspense>
    </PageFrame>
  );
}

async function TasksContent() {
  const d = await getTaskBoard();
  return <TaskBoard open={d.open} done={d.done} projects={d.projects} checklist={d.checklist} nowMs={d.nowMs} tz={d.tz} />;
}
