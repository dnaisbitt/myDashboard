import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { BODY_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { Sleep } from "@/components/body/sleep";
import { getBody } from "@/lib/data/life";

export const metadata: Metadata = { title: "Sleep" };

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
  const d = await getBody();
  return <Sleep profile={d.profile} sleep={d.sleep} nextDay={d.nextDay} todayKey={d.todayKey} tz={d.tz} />;
}
