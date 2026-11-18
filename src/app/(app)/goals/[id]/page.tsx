import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GoalDetail } from "@/components/plans/goal-detail";
import { PageFrame } from "@/components/shell/page-header";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { getGoal } from "@/lib/data/plans";

export const metadata: Metadata = { title: "Goal" };

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <PageFrame>
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <GoalContent params={params} />
      </Suspense>
    </PageFrame>
  );
}

async function GoalContent({ params }: { params: PageProps<"/goals/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <GoalDetail {...await getGoal(id)} />;
}
