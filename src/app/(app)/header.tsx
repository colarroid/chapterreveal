"use client";

import { BookOpen, History, LoaderCircle, LogOut, Music, Presentation, Settings, SunMoon, type LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { forgetOfflinePages } from "@/components/offline";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui";
import { forgetBibleKey } from "@/lib/scripture/bible-crypto";
import { forgetSongs } from "@/lib/songs/store";
import { LOCKED_THEME } from "@/lib/theme-script";
import { isConsolePath } from "./(consoles)/active";
import { GlidingPill } from "@/components/motion";
import { supabaseBrowser } from "@/lib/supabase/client";

export const HEADER_ACTIONS_ID = "header-actions";

const NAV = [
  { href: "/dashboard", label: "Scriptures", icon: BookOpen },
  { href: "/songs", label: "Song Lyrics", icon: Music },
  { href: "/slides", label: "Slides", icon: Presentation },
];

// Everything that is not a live view lives in the account menu.
const MENU = [
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Swaps the tab's icon for a spinner from the moment it's clicked until the
// page is ready, so a click never looks ignored. Must sit inside the Link.
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle size={16} className="animate-spin" /> : <Icon size={16} />;
}

interface Person {
  email: string;
  firstName: string;
  lastName: string;
}

function initials({ firstName, lastName, email }: Person): string {
  const fromName = `${firstName.trim()[0] ?? ""}${lastName.trim()[0] ?? ""}`;
  return (fromName || email[0] || "?").toUpperCase();
}

// Spotify-style account button: a round avatar that opens a small menu with
// who you are, Settings, the theme switch and Sign out.
function AccountMenu({ person, churchName }: { person: Person; churchName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't let the console treat this Esc as "clear the screen".
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await supabaseBrowser().auth.signOut();
    forgetOfflinePages();
    forgetSongs();
    forgetBibleKey();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
        className={`grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-[13px] font-bold transition hover:scale-105 active:scale-95 ${
          open ? "ring-2 ring-ink/70" : "ring-1 ring-line-strong"
        }`}
      >
        {initials(person)}
      </button>

      {open && (
        <div role="menu" className="absolute top-[calc(100%+8px)] right-0 z-50 w-72 rounded-xl bg-menu p-1.5 shadow-pop ring-1 ring-line">
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-fill text-sm font-bold text-on-accent">{initials(person)}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{name || person.email}</span>
              {name && <span className="block truncate text-sm text-muted">{person.email}</span>}
              <span className="block truncate text-xs text-faint">{churchName}</span>
            </span>
          </div>
          <div className="my-1 h-px bg-line" />
          {MENU.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] hover:bg-ink/10"
            >
              <Icon size={17} className="text-muted" /> {label}
            </Link>
          ))}
          {/* Hidden while the app is locked to one theme (LOCKED_THEME). */}
          {!LOCKED_THEME && (
            <div className="flex h-10 items-center gap-3 rounded-lg px-3 text-[15px]">
              <SunMoon size={17} className="text-muted" />
              <span className="flex-1">Theme</span>
              <ThemeToggle />
            </div>
          )}
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] hover:bg-ink/10"
          >
            {signingOut ? <LoaderCircle size={17} className="animate-spin text-muted" /> : <LogOut size={17} className="text-muted" />}
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppHeader({ churchName, email, firstName, lastName }: { churchName: string } & Person) {
  const path = usePathname();
  const tabs = useRef<HTMLElement>(null);
  // Until the gliding highlight has measured, the open tab has its own.
  const [pill, setPill] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 px-4">
      {/* The wide logo; the mark alone where phones are tight on room. */}
      <span className="sm:hidden">
        <Logo href="/dashboard" variant="icon" className="h-9" />
      </span>
      <span className="hidden sm:inline-flex">
        <Logo href="/dashboard" variant="header" className="h-[31px]" />
      </span>

      {/* One highlight glides to the open tab (after beUI's tabs). */}
      <nav ref={tabs} className="relative flex items-center gap-1 rounded-full bg-surface p-1">
        <GlidingPill onShown={setPill} activeKey={NAV.find(({ href }) => path === href || path.startsWith(`${href}/`))?.href ?? null} />
        {NAV.map(({ href, label, icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              data-pill-key={href}
              onClick={(e) => {
                // Between consoles: they're all mounted already (workspace.tsx),
                // so just change the address; no page load, nothing lost.
                if (isConsolePath(path) && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  if (path !== href) window.history.pushState(null, "", href);
                }
              }}
              className={`relative inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-sm transition-colors active:scale-95 ${
                active ? `font-bold text-ink ${pill ? "" : "bg-surface-3"}` : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <span className="relative inline-flex items-center gap-2">
                <NavIcon icon={icon} />
                <span className="hidden sm:inline">{label}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {/* Page-specific actions (the console's End service) render in here. */}
        <div id={HEADER_ACTIONS_ID} className="flex items-center gap-3 empty:hidden" />
        <AccountMenu person={{ email, firstName, lastName }} churchName={churchName} />
      </div>
    </header>
  );
}
