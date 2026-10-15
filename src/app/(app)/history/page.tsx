import { BookOpen, CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PendingIcon } from "@/components/pending";
import { Chip } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { requireMembership, supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const m = await requireMembership();
  const supabase = await supabaseServer();
  // Services left open by a crash or a closed laptop are closed first, so
  // only a service that's really running shows as running.
  await supabase.rpc("close_stale_services", { p_church: m.churchId });
  const { data: services } = await supabase
    .from("services")
    .select("id, started_at, ended_at, end_reason, verses_shown(count)")
    .eq("church_id", m.churchId)
    .order("started_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Service history</h1>
      <p className="mt-1 text-sm text-muted">Every service is saved with its full transcript and the verses that went on screen.</p>

      {!services?.length ? (
        <div className="mt-8 flex flex-col items-center rounded-lg bg-surface px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-muted">
            <CalendarDays size={24} />
          </span>
          <p className="mt-4 font-bold">No services yet</p>
          <p className="mt-0.5 text-sm leading-snug text-muted">They appear here after the first one ends.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-1">
          {services.map((s) => {
            const count = (s.verses_shown as unknown as { count: number }[])[0]?.count ?? 0;
            const d = new Date(s.started_at);
            return (
              <li key={s.id}>
                <Link href={`/history/${s.id}`} className="group flex items-center gap-4 rounded-lg px-3 py-3 transition hover:bg-surface">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-surface-2 text-center leading-none">
                    <span>
                      <span className="block text-[10px] font-bold text-muted uppercase">{d.toLocaleDateString(undefined, { month: "short" })}</span>
                      <span className="block text-lg font-bold">{d.getDate()}</span>
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                    <p className="text-sm text-muted">
                      {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {formatDuration(s.started_at, s.ended_at)}
                      {s.end_reason === "silence" && " · ended after silence"}
                    </p>
                  </div>
                  <Chip tone={count ? "ok" : "neutral"}>
                    <BookOpen size={13} /> {count} {count === 1 ? "verse" : "verses"}
                  </Chip>
                  <span className="text-faint transition group-hover:text-ink">
                    <PendingIcon size={18}>
                      <ChevronRight size={18} />
                    </PendingIcon>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
