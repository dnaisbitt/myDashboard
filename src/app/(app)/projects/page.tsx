import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectOverview } from "@/components/plans/project-overview";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { TASK_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { getGoals, getProjects } from "@/lib/data/plans";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <PageFrame>
      <PageHeader title="Tasks & Projects" />
      <LinkTabs items={TASK_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <ProjectsContent />
      </Suspense>
    </PageFrame>
  );
}

async function ProjectsContent() {
  const [projects, goals] = await Promise.all([getProjects(), getGoals()]);
  return (
    <ProjectOverview
      projects={projects}
      goals={goals.filter((g) => g.status === "active" || g.status === "paused").map((g) => ({ id: g.id, title: g.title }))}
    />
  );
}
