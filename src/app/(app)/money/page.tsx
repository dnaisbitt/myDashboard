import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { MONEY_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { MoneyOverview } from "@/components/money/money-overview";
import { getMoney } from "@/lib/data/life";

export const metadata: Metadata = { title: "Money" };

export default function Page() {
  return (
    <PageFrame className="max-w-[1120px]">
      <PageHeader title="Money" />
      <LinkTabs items={MONEY_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <MoneyContent />
      </Suspense>
    </PageFrame>
  );
}

async function MoneyContent() {
  const d = await getMoney();
  return <MoneyOverview period={d.period} items={d.items} txns={d.txns} savings={d.savings} goals={d.goals} todayKey={d.todayKey} />;
}
