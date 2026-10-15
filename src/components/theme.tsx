"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";

// The chosen theme lives on <html data-theme>. With nothing saved, the CSS
// follows the system setting. The output screen ignores all of this: it is
// always black on the projector.

type Theme = "light" | "dark";

function resolved(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(resolved());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(resolved());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    setTheme(t);
  };

  const option = (t: Theme, Icon: typeof Sun, label: string) => (
    <button
      type="button"
      onClick={() => choose(t)}
      aria-label={label}
      aria-pressed={theme === t}
      className={`grid h-7 w-7 place-items-center rounded-full transition ${
        theme === t
          ? onDark
            ? "bg-white text-black"
            : "bg-bg text-ink shadow-card ring-1 ring-line-strong"
          : onDark
            ? "text-white/60 hover:text-white"
            : "text-faint hover:text-ink"
      }`}
    >
      <Icon size={15} />
    </button>
  );

  return (
    <div role="group" aria-label="Theme" className={`inline-flex items-center gap-0.5 rounded-full p-0.5 ${onDark ? "bg-white/12" : "bg-surface-2"} ${className}`}>
      {option("light", Sun, "Light theme")}
      {option("dark", Moon, "Dark theme")}
    </div>
  );
}
