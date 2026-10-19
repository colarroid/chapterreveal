import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui";
import { LEGAL } from "@/lib/brand";

// Terms of Use and Privacy Policy: plain reading pages, open to everyone.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-5">
        <Logo className="h-10" />
        <span className="ml-auto">
          <ThemeToggle />
        </span>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-4 pb-16">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-5 gap-y-2 px-5 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} {LEGAL.operator}</span>
          <Link href="/terms" className="hover:text-ink">
            Terms of Use
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy Policy
          </Link>
          <Link href="/" className="ml-auto hover:text-ink">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
