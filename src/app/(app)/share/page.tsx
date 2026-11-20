import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { ShareImport } from "@/components/share/share-import";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { aiStatusMessage, resolveAiStatus } from "@/lib/ai/provider";
import { getClock } from "@/lib/data/viewer";

export const metadata: Metadata = { title: "Shared message" };

/** Target of the Android share sheet (manifest share_target) and the "Paste a message" link. */
export default function SharePage({ searchParams }: PageProps<"/share">) {
  return (
    <PageFrame>
      <PageHeader title="Add from a message" lede="Share a message from WhatsApp (or paste one) and LifeOS reads out the dates and times. You pick what goes in." />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <ShareContent searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function ShareContent({ searchParams }: { searchParams: PageProps<"/share">["searchParams"] }) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  // Android puts the message in "text" (sometimes "title"); keep any link too.
  const shared = [pick("title"), pick("text"), pick("url")]
    .map((s) => s.trim())
    .filter((s, i, all) => s && all.indexOf(s) === i)
    .join("\n")
    .slice(0, 6000);
  const { profile, tz } = await getClock();
  const status = resolveAiStatus(profile.ai_enabled);
  return <ShareImport initialText={shared} fromShare={Boolean(shared)} aiReady={status.state === "ready"} aiMessage={aiStatusMessage(status)} tz={tz} />;
}
