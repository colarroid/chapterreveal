import { Skeleton } from "@/components/ui";

// Shown while a console's data loads, in the console's own layout.
export function ConsoleSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 pb-2 lg:h-[calc(100dvh-4rem)]" aria-busy aria-label="Loading console">
      <div className="flex items-center gap-4 rounded-lg bg-surface px-4 py-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-9 w-64 rounded-full" />
        <Skeleton className="ml-auto h-11 w-40 rounded-full" />
      </div>
      <div className="grid min-h-[60vh] flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-2 rounded-lg bg-surface p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
        <div className="space-y-3 rounded-lg bg-surface p-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="aspect-video w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
