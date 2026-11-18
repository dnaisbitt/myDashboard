import type { Metadata } from "next";
import { Suspense } from "react";
import { TodaySkeleton } from "@/components/today/today-skeleton";
import { TodayView } from "@/components/today/today-view";
import { aiStatusMessage, resolveAiStatus } from "@/lib/ai/provider";
import { getTodayData } from "@/lib/data/today";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayContent />
    </Suspense>
  );
}

async function TodayContent() {
  const data = await getTodayData();
  const status = resolveAiStatus(data.profile.ai_enabled);
  return <TodayView data={data} ai={{ ready: status.state === "ready", message: aiStatusMessage(status) }} />;
}
