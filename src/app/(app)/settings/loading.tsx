import { Skeleton } from "@/components/ui";

// Shown the instant Settings is clicked, while the server fetches the team.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8" aria-busy aria-label="Loading settings">
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 space-y-2">
        {[3, 4, 3].map((rows, i) => (
          <section key={i} className="rounded-lg bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {Array.from({ length: rows }, (_, j) => (
                <Skeleton key={j} className="h-11 w-full rounded-full" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
