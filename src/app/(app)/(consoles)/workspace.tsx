"use client";

import { usePathname } from "next/navigation";
import { Suspense, use, useEffect, useState, type ReactNode } from "react";
import { Notice } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { ConsoleActive, isConsolePath, type ConsolePath } from "./active";
import type { ConsoleBase, ScriptureData, SlidesData, SongsData } from "./data";
import { Console } from "./dashboard/console";
import { ConsoleSkeleton } from "./skeleton";
import { Slides } from "./slides/slides";
import { Worship } from "./songs/worship";

// Scriptures, Song Lyrics and Slides as one workspace. Each console mounts
// the first time it's opened and then stays mounted, hidden when another is
// showing: switching is instant and nothing is lost (the open chapter, the
// song and slide, the search, Live). The header switches tabs without asking
// the server (history.pushState; Next keeps usePathname in step).

const TITLES: Record<ConsolePath, string> = { "/dashboard": "Scriptures", "/songs": "Song Lyrics", "/slides": "Slides" };

export function Workspace({
  base,
  scripture,
  songs,
  slides,
}: {
  base: ConsoleBase;
  scripture: Promise<ScriptureData>;
  songs: Promise<SongsData>;
  slides: Promise<SlidesData>;
}) {
  const path = usePathname();
  const active = isConsolePath(path) ? path : null;
  const [opened, setOpened] = useState<ConsolePath[]>(active ? [active] : []);
  if (active && !opened.includes(active)) setOpened([...opened, active]);

  // A tab switch doesn't load a page, so the title follows here.
  useEffect(() => {
    if (active) document.title = `${TITLES[active]} · ${APP_NAME}`;
  }, [active]);

  const panel = (p: ConsolePath, el: ReactNode) =>
    opened.includes(p) && (
      <ConsoleActive.Provider key={p} value={active === p}>
        <div className={active === p ? "contents" : "hidden"}>
          <Suspense fallback={<ConsoleSkeleton />}>{el}</Suspense>
        </div>
      </ConsoleActive.Provider>
    );

  return (
    <>
      {panel("/dashboard", <ScripturePanel base={base} data={scripture} />)}
      {panel("/songs", <SongsPanel base={base} data={songs} />)}
      {panel("/slides", <SlidesPanel base={base} data={slides} />)}
    </>
  );
}

function ScripturePanel({ base, data }: { base: ConsoleBase; data: Promise<ScriptureData> }) {
  const d = use(data);
  return <Console {...base} translationId={d.translationId} translations={d.translations} starred={d.starred} />;
}

function SongsPanel({ base, data }: { base: ConsoleBase; data: Promise<SongsData> }) {
  const d = use(data);
  if ("error" in d) return <LoadError text={d.error} />;
  return <Worship {...base} library={d.library} setlists={d.setlists} />;
}

function SlidesPanel({ base, data }: { base: ConsoleBase; data: Promise<SlidesData> }) {
  const d = use(data);
  if ("error" in d) return <LoadError text={d.error} />;
  return <Slides churchId={base.churchId} userId={base.userId} screenToken={base.screenToken} display={base.display} plan={d.plan} initial={d.initial} />;
}

function LoadError({ text }: { text: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Notice tone="error">{text}</Notice>
    </main>
  );
}
