import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { TaskList } from "@/components/tasks/task-list";
import { Planned } from "@/components/ui/misc";
import { getOpenTasks } from "@/lib/data/tasks";

export const metadata: Metadata = { title: "Tasks & Projects" };

export default function TasksPage() {
  return (
    <PageFrame>
      <PageHeader title="Tasks & Projects" lede="Everything you've committed to, soonest first." />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <TasksContent />
      </Suspense>
      <div className="mt-10 flex flex-wrap items-center gap-2 text-small text-ink-2">
        <Planned phase="Phase 4" />
        <span>Projects and milestones, subtasks and checklists, recurrence, categories, filters, and day/week/month views.</span>
      </div>
    </PageFrame>
  );
}

async function TasksContent() {
  const d = await getOpenTasks();
  return <TaskList open={d.open} recentlyDone={d.recentlyDone} nowMs={d.nowMs} tz={d.tz} />;
}
