import { Skeleton } from "@/components/ui";

// Shown the instant a service is opened, while its transcript loads.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8" aria-busy aria-label="Loading service">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-5 h-8 w-80 max-w-full" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <div className="mt-8 grid gap-2 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3 rounded-lg bg-surface p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
          ))}
        </div>
        <div className="h-fit space-y-3 rounded-lg bg-surface p-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}
