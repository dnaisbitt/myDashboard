import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectDetail } from "@/components/plans/project-detail";
import { PageFrame } from "@/components/shell/page-header";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { getProject } from "@/lib/data/plans";

export const metadata: Metadata = { title: "Project" };

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <PageFrame>
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <ProjectContent params={params} />
      </Suspense>
    </PageFrame>
  );
}

async function ProjectContent({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getProject(id);
  return <ProjectDetail {...d} />;
}
