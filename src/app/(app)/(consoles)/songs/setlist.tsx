"use client";

import { ArrowDown, ArrowUp, ListMusic, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/confirm";
import { Dropdown } from "@/components/dropdown";
import { IconButton } from "@/components/ui";

export interface Setlist {
  id: string;
  name: string;
  song_ids: string[];
}

const NONE = "none";
// The panel is grey already, so the usual grey hover wouldn't show: a
// translucent one works on any background.
const HOVER = "h-8 w-8 hover:bg-ink/10!";
const SMALL = "h-7 w-7 hover:bg-ink/10!";

/**
 * Tonight's songs, in order. While one is chosen, worship mode listens for
 * these songs first. Songs are added from the library with their + button.
 */
export function SetlistPanel({
  setlists,
  activeId,
  titles,
  currentSongId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onChange,
  onOpen,
}: {
  setlists: Setlist[];
  activeId: string | null;
  /** Song titles by id, for songs this church can see. */
  titles: Map<string, string>;
  currentSongId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => Promise<void>;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => Promise<void>;
  onChange: (id: string, songIds: string[]) => void;
  onOpen: (songId: string) => void;
}) {
  const active = setlists.find((s) => s.id === activeId) ?? null;
  const songs = (active?.song_ids ?? []).filter((id) => titles.has(id));
  const [name, setName] = useState(active?.name ?? "");
  // Creating or deleting waits on the database: show it, so a click never looks ignored.
  const [busy, setBusy] = useState<"create" | "delete" | null>(null);
  const run = async (what: "create" | "delete", fn: () => Promise<void>) => {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => setName(active?.name ?? ""), [active?.id, active?.name]);

  const move = (i: number, dir: -1 | 1) => {
    if (!active) return;
    const next = [...songs];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(active.id, next);
  };

  return (
    <div className="rounded-lg bg-surface-2">
      <div className="flex items-center gap-2 p-2">
        <ListMusic size={16} className="ml-1 shrink-0 text-muted" />
        <Dropdown
          ariaLabel="Playlist"
          value={activeId ?? NONE}
          onChange={(v) => onSelect(v === NONE ? null : v)}
          options={[{ value: NONE, label: "No playlist", hint: "Listen for every song" }, ...setlists.map((s) => ({ value: s.id, label: s.name }))]}
          className="h-8 min-w-0 flex-1 text-sm font-bold"
        />
        <IconButton label="New playlist" onClick={() => void run("create", onCreate)} disabled={busy !== null} className={HOVER}>
          {busy === "create" ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
        </IconButton>
        {active && (
          <IconButton
            label="Delete playlist"
            className={`${HOVER} hover:text-negative`}
            disabled={busy !== null}
            onClick={async () => {
              const ok = await confirmDialog({ title: `Delete "${active.name}"?`, body: "The songs stay in the library.", confirmLabel: "Delete", danger: true });
              if (ok) await run("delete", () => onDelete(active.id));
            }}
          >
            {busy === "delete" ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </IconButton>
        )}
      </div>

      {active && (
        <div className="px-2 pb-2">
          <label className="block">
            <span className="sr-only">Playlist name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== active.name && onRename(active.id, name.trim())}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              maxLength={80}
              className="h-8 w-full rounded-md bg-transparent px-2 text-xs text-muted outline-none hover:bg-surface-3 focus:bg-surface-3 focus:text-ink"
            />
          </label>
          {songs.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted">Add songs with the + next to each song in the library below.</p>
          ) : (
            <ol className="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
              {songs.map((id, i) => (
                <li key={id} className={`group flex items-center gap-1 rounded-md pl-2 ${id === currentSongId ? "bg-accent-fill/15" : "hover:bg-surface-3"}`}>
                  <span className="w-4 shrink-0 text-right text-[11px] font-bold text-faint tabular-nums">{i + 1}</span>
                  <button type="button" onClick={() => onOpen(id)} className="min-w-0 flex-1 truncate py-1.5 pl-1.5 text-left text-sm font-semibold">
                    {titles.get(id)}
                  </button>
                  <span className="flex opacity-60 group-hover:opacity-100">
                    <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className={SMALL}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === songs.length - 1} className={SMALL}>
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton label="Remove from playlist" onClick={() => onChange(active.id, songs.filter((s) => s !== id))} className={`${SMALL} hover:text-negative`}>
                      <X size={14} />
                    </IconButton>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
