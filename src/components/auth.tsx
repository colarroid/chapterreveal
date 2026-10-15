import { ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";
import { ThemeToggle } from "./theme";

// Auth pages after terms.so: no card, a narrow column on the page itself,
// the logo mark, a medium-weight title, filled pill fields and full-width
// pill buttons. Colours stay Spotify (green primary, achromatic surfaces).

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  head,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  head?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      {head}
      <div className="w-full max-w-[360px]">
        <Link href="/" aria-label={`${APP_NAME} home`} className="inline-grid h-10 w-10 place-items-center rounded-full bg-accent-fill text-on-accent">
          <BookOpen size={20} />
        </Link>
        <h1 className="mt-7 text-[26px] leading-tight font-medium tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-6 text-center text-[15px] text-muted">{footer}</div>}
        <div className="mt-12 flex items-center justify-between text-sm text-muted">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-ink">
            <ArrowLeft size={15} /> {APP_NAME}
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}

export function AuthField({
  label,
  hint,
  action,
  className = "",
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string; action?: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[15px] font-medium">{label}</span>
        {action}
      </span>
      <input
        {...props}
        className={`mt-2 block h-12 w-full rounded-full bg-surface-2 px-5 text-[15px] text-ink outline-none transition placeholder:text-faint focus:ring-2 focus:ring-ink/80 ${className}`}
      />
      {hint && <span className="mt-2 block px-1 text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function AuthButton({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  const styles = variant === "primary" ? "bg-accent-fill text-on-accent hover:brightness-105" : "bg-surface-2 text-ink hover:bg-surface-3";
  return (
    <button
      {...props}
      className={`inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-semibold transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

/** Google's "G", in its own colours as their brand rules require. */
export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

/**
 * Google sign-in is shown only once it is switched on in Supabase
 * (Authentication > Providers > Google) and NEXT_PUBLIC_GOOGLE_AUTH=1.
 */
export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

