import { Skeleton } from "@/components/ui/misc";

export function TodaySkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pt-6 sm:px-8 lg:px-12 lg:pt-14" aria-busy="true" aria-label="Loading today">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-4 h-12 w-[min(100%,28rem)]" />
      <Skeleton className="mt-4 h-5 w-[min(100%,22rem)]" />
      <div className="mt-14 grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </div>
    </div>
  );
}
