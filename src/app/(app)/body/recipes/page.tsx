import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { BODY_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { Recipes } from "@/components/body/recipes";
import { getFood } from "@/lib/data/life";
import { getClock } from "@/lib/data/viewer";
import { weekStartKey } from "@/lib/time";

export const metadata: Metadata = { title: "Recipes" };

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
  const clock = await getClock();
  const d = await getFood(weekStartKey(clock.todayKey));
  return <Recipes recipes={d.recipes} />;
}
