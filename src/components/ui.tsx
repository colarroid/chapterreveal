import { CircleAlert, CircleCheck, Info, LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";

// Shared primitives. Spotify geometry: pill buttons with an uppercase label
// voice, circular icon buttons, borderless surfaces, inset-shadow fields.

type LogoVariant = "header" | "normal" | "icon";

const LOGO_SIZE: Record<LogoVariant, string> = { header: "h-6", normal: "h-12", icon: "h-7" };

/**
 * The ReedArk logo (files in public/brand). "header" is the wide one for
 * page headers, "normal" the stacked one for everywhere else, "icon" the
 * mark alone. Dark lettering on light backgrounds and light lettering on
 * dark; globals.css shows the right one for the theme. `className` sets the
 * height (h-8, say); the width follows.
 */
export function Logo({ href = "/", variant = "normal", className }: { href?: string; variant?: LogoVariant; className?: string }) {
  const size = className ?? LOGO_SIZE[variant];
  return (
    <Link href={href} aria-label={`${APP_NAME} home`} className="inline-flex shrink-0 items-center">
      {variant === "icon" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small SVG; next/image adds nothing here
        <img src="/brand/logo-icon.svg" alt={APP_NAME} className={`${size} w-auto`} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small SVG; next/image adds nothing here */}
          <img src={`/brand/logo-${variant}-on-light.svg`} alt={APP_NAME} className={`logo-on-light ${size} w-auto`} />
          {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
          <img src={`/brand/logo-${variant}-on-dark.svg`} alt={APP_NAME} className={`logo-on-dark ${size} w-auto`} />
        </>
      )}
    </Link>
  );
}

export function Field({ label, hint, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input
        {...props}
        className={`inset-field mt-1.5 block w-full rounded-md bg-bg px-3.5 py-3 text-[15px] text-ink placeholder:text-faint ${className}`}
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";

export const buttonStyles: Record<Variant, string> = {
  primary: "bg-accent-fill text-on-accent hover:scale-[1.03] hover:brightness-105",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3",
  outline: "text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ink)]",
  danger: "bg-negative text-white hover:brightness-110",
  ghost: "text-muted hover:text-ink",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  const sizing = size === "sm" ? "h-8 px-4 text-[11px]" : "h-11 px-6 text-xs";
  // While loading: a spinner, full colour (not faded like disabled), and no
  // second click.
  const state = loading ? "pointer-events-none" : "disabled:pointer-events-none disabled:opacity-40";
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`label-caps inline-flex shrink-0 items-center justify-center gap-2 rounded-full transition active:scale-[0.97] ${state} ${sizing} ${buttonStyles[variant]} ${className}`}
    >
      {loading && <LoaderCircle size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

/** Circular icon button, Spotify's play-control shape. */
export function IconButton({ label, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : tone === "ok" ? CircleCheck : Info;
  const color = tone === "error" ? "text-negative" : tone === "ok" ? "text-accent" : "text-info";
  return (
    <div className="flex gap-2.5 rounded-lg bg-surface-2 px-3.5 py-3 text-sm">
      <Icon size={17} className={`mt-px shrink-0 ${color}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Pixel-grid loader with a shimmering label, after beautifului.dev. */
export function PixelLoader({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-sm">
      <span className="pixel-grid grid grid-cols-3 gap-[2px]" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="h-[3px] w-[3px] rounded-[1px] bg-ink" style={{ animationDelay: `${((i * 7) % 9) * 0.12}s` }} />
        ))}
      </span>
      <span className="text-shimmer font-semibold">{label}</span>
    </span>
  );
}

/** Three-bar confidence meter, after beautifului.dev's recommendation card. */
export function SignalBars({ level, label }: { level: 1 | 2 | 3; label?: string }) {
  const color = level === 3 ? "bg-accent-fill" : level === 2 ? "bg-warning" : "bg-faint";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`w-[3px] rounded-full ${n <= level ? color : "bg-line-strong"}`} style={{ height: 5 + n * 3 }} />
        ))}
      </span>
      {label}
    </span>
  );
}

/** Small status capsule, after beautifului.dev's task rows. */
export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "live" | "error"; children: ReactNode }) {
  const styles = {
    neutral: "bg-surface-2 text-muted",
    ok: "bg-accent-fill/15 text-accent",
    warn: "bg-warning/15 text-warning",
    live: "bg-negative/15 text-negative",
    error: "bg-negative/15 text-negative",
  }[tone];
  return <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${styles}`}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid h-5 min-w-5 place-items-center rounded bg-surface-3 px-1 font-sans text-[10px] font-bold text-muted">{children}</kbd>;
}

/** A grey placeholder block that gently pulses while a page loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}
