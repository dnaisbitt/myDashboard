import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { InboxList } from "@/components/tasks/inbox-list";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { Planned } from "@/components/ui/misc";
import { getInbox } from "@/lib/data/tasks";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <PageFrame>
      <PageHeader
        title="Inbox"
        lede="Oldest first. Decide each one: do it today, give it a date, keep it as a task, or archive it."
      />
      <Suspense fallback={<ListSkeleton />}>
        <InboxContent />
      </Suspense>
      <div className="mt-10 flex flex-wrap items-center gap-2 text-small text-ink-2">
        <Planned phase="Phase 4" />
        <span>Automatic resurfacing of old items, event detection (“dentist Tue 3pm”) and shopping-list routing.</span>
      </div>
    </PageFrame>
  );
}

async function InboxContent() {
  const { tasks, nowMs, tz } = await getInbox();
  return <InboxList tasks={tasks} nowMs={nowMs} tz={tz} />;
}
