import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui";
import { AskAi } from "./ask-ai";
import { LinkPending } from "./link-pending";
import { APP_NAME, LEGAL } from "@/lib/brand";

/**
 * The public pages' floating header: a pill that stays 24 px from the top
 * while the page scrolls, after gettakecontrol.app (964 x 54, 8/8/8/24
 * padding, 14 px semibold links, a dark pill button).
 */
export function SiteHeader({ home = false, signedIn = false }: { home?: boolean; signedIn?: boolean }) {
  return (
    <header className="fixed inset-x-0 top-6 z-50 px-4 sm:px-6">
      <div className="mx-auto flex h-[54px] max-w-[964px] items-center justify-between gap-6 rounded-full bg-bg py-2 pr-2 pl-5 shadow-[0_4px_7px_rgba(18,18,17,0.06)] ring-1 ring-line sm:pl-6">
        <Logo variant="header" className="h-5 sm:h-6" />
        <nav className="flex items-center gap-0.5 text-sm leading-4 font-semibold tracking-[-0.14px] whitespace-nowrap sm:gap-2">
          <a href={home ? "#how" : "/#how"} className="hidden h-[38px] items-center px-3 text-ink/75 transition hover:text-ink md:flex">
            How it works
          </a>
          <Link href="/features" className="hidden h-[38px] items-center px-3 text-ink/75 transition hover:text-ink sm:flex">
            Features
          </Link>
          <Link href="/pricing" className="hidden h-[38px] items-center px-3 text-ink/75 transition hover:text-ink sm:flex">
            Pricing
          </Link>
          {!signedIn && (
            <Link href="/login" className="flex h-[38px] items-center px-2.5 text-ink/75 transition hover:text-ink sm:px-3">
              Log in
            </Link>
          )}
          {/* The smallest phones have no room for it beside the buttons. */}
          <ThemeToggle className="mx-1 max-[379px]:hidden" />
          {/* Signed in: straight back to work. */}
          <Link
            href={signedIn ? "/dashboard" : "/signup"}
            // Signed in, the console is where they're going: fetch it in the
            // background while they read, so the click opens it straight away.
            prefetch={signedIn ? true : undefined}
            className="flex h-[38px] items-center gap-2 rounded-full bg-ink px-4 text-bg transition hover:opacity-85"
          >
            <LinkPending />
            {signedIn ? "Open console" : "Sign up"}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ home = false }: { home?: boolean }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[60rem] grid-cols-2 gap-10 px-5 py-12 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-x-12 sm:px-8">
        <div className="col-span-2 max-w-sm sm:col-span-1">
          <Logo className="h-14" />
          <p className="mt-4 text-sm text-muted">
            {APP_NAME} listens to the sermon and the singing, and puts scripture and song lyrics on your projector and livestream. Start free; upgrade when
            your church needs more.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-bold">Product</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <a href={home ? "#how" : "/#how"} className="hover:text-ink">
                How it works
              </a>
            </li>
            <li>
              <Link href="/features" className="hover:text-ink">
                Features
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-ink">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/signup" className="hover:text-ink">
                Sign up
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-ink">
                Log in
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold">Legal</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <Link href="/terms" className="hover:text-ink">
                Terms of Use
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-ink">
                Privacy Policy
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold">Contact</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-ink">
                {LEGAL.contactEmail}
              </a>
            </li>
            <li>
              <a href={`mailto:${LEGAL.supportEmail}`} className="hover:text-ink">
                {LEGAL.supportEmail}
              </a>
            </li>
          </ul>
        </div>
        {/* Between dividers, as on gettakecontrol.app. */}
        <div className="col-span-2 border-y border-line py-[30px] sm:col-span-4">
          <AskAi />
        </div>
        <p className="col-span-2 text-xs text-faint sm:col-span-4">
          © {new Date().getFullYear()} {LEGAL.operator}. {APP_NAME} is a product of {LEGAL.operator}.
        </p>
      </div>
    </footer>
  );
}
