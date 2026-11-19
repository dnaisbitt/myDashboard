import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { MONEY_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { TermPlan } from "@/components/money/term-plan";
import { getMoney } from "@/lib/data/life";

export const metadata: Metadata = { title: "Term plan" };

export default function Page() {
  return (
    <PageFrame className="max-w-[1120px]">
      <PageHeader title="Money" />
      <LinkTabs items={MONEY_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <PlanContent />
      </Suspense>
    </PageFrame>
  );
}

async function PlanContent() {
  const d = await getMoney();
  return <TermPlan periods={d.periods} period={d.period} items={d.items} todayKey={d.todayKey} />;
}
