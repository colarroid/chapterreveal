import { Skeleton } from "@/components/ui";

// Shown the instant History is clicked, while the server fetches services.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8" aria-busy aria-label="Loading history">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <ul className="mt-6 space-y-1">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex items-center gap-4 rounded-lg px-3 py-3">
            <Skeleton className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </li>
        ))}
      </ul>
    </main>
  );
}
