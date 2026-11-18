import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { InboxList } from "@/components/tasks/inbox-list";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { Decide } from "@/components/today/decide";
import { getInbox } from "@/lib/data/tasks";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <PageFrame>
      <PageHeader
        title="Inbox"
        lede="Oldest first. Decide each one: do it today, give it a date, keep it as a task, or archive it. Nothing is allowed to sit here forever."
      />
      <Suspense fallback={<ListSkeleton />}>
        <InboxContent />
      </Suspense>
    </PageFrame>
  );
}

async function InboxContent() {
  const { tasks, stale, nowMs, tz } = await getInbox();
  return (
    <div className="flex flex-col gap-12">
      <InboxList tasks={tasks} nowMs={nowMs} tz={tz} />
      {stale.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-small text-ink-2">Open tasks with no date that haven&apos;t been touched in two weeks:</p>
          <Decide items={stale} nowMs={nowMs} tz={tz} limit={20} />
        </div>
      ) : null}
    </div>
  );
}
