import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { BODY_TABS } from "@/components/shell/section-tabs";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { LinkTabs } from "@/components/ui/tabs";
import { Meals } from "@/components/body/meals";
import { getFood, type Checkin } from "@/lib/data/life";
import { getClock, getViewer } from "@/lib/data/viewer";
import { isValidKey, weekStartKey } from "@/lib/time";

export const metadata: Metadata = { title: "Meals" };

export default function Page({ searchParams }: PageProps<"/body/meals">) {
  return (
    <PageFrame className="max-w-[1120px]">
      <PageHeader title="Body" />
      <LinkTabs items={BODY_TABS} className="-mt-4 mb-8" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/body/meals">["searchParams"] }) {
  const sp = await searchParams;
  const clock = await getClock();
  const week = typeof sp.week === "string" && isValidKey(sp.week) ? weekStartKey(sp.week) : weekStartKey(clock.todayKey);
  const [d, { supabase }] = await Promise.all([getFood(week), getViewer()]);
  const { data: today } = await supabase.from("daily_checkins").select("on_date,ate_well,protein_hit,calories").eq("on_date", clock.todayKey).maybeSingle();
  return (
    <Meals
      profile={clock.profile}
      weekStart={week}
      todayKey={clock.todayKey}
      recipes={d.recipes}
      plan={d.plan}
      blocks={d.blocks}
      shopping={d.shopping}
      shoppingTasks={d.shoppingTasks}
      today={(today as Checkin | null) ?? null}
      tz={clock.tz}
    />
  );
}
