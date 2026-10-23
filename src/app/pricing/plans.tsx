"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatPrice, limitText, PLAN_LIMITS, type Price } from "@/lib/plans";

const free = PLAN_LIMITS.free;
const FREE_FEATURES = [
  "Projects verses automatically in less than a second",
  "Detects and projects worship lyrics automatically",
  `${limitText("image", free.image)} and ${limitText("video", free.video)} as custom backgrounds`,
  `${free.decks} slide presentations, up to ${free.deckSlides} slides each (text and pictures)`,
  "Popular translations",
  "Every Bible translation we offer",
  "Shared song library, your own songs and playlists",
  "Projector and green-screen livestream outputs",
  "Service history, and Bibles that work offline",
];
const PAID_EXTRAS = ["Video slides", "Unlimited presentations and slides", "Instant access to future releases and updates"];

export function PricingPlans({ price }: { price: Price }) {
  const [yearly, setYearly] = useState(false);
  const money = (n: number) => formatPrice(n, price.currency);
  const saving = Math.round((1 - price.yearly / (price.monthly * 12)) * 100);
  // A month of the yearly price, rounded to what reads naturally.
  const perMonth = price.yearly / 12;
  const perMonthText = money(price.currency === "NGN" ? Math.round(perMonth) : Math.round(perMonth * 100) / 100);

  return (
    <div className="mt-10 sm:mt-12">
      {/* Monthly / Annual, on the dark top of the gradient. */}
      <div className="flex">
        <div role="radiogroup" aria-label="Billing" className="inline-flex items-center rounded-full bg-white/10 p-1 ring-1 ring-white/15">
          {([
            [false, "Monthly"],
            [true, "Annual"],
          ] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={yearly === value}
              onClick={() => setYearly(value)}
              className={`flex h-9 items-center gap-2 rounded-full px-5 text-sm transition ${yearly === value ? "bg-white font-bold text-black" : "text-white/75 hover:text-white"}`}
            >
              {label}
              {value && <span className="rounded-full bg-accent-fill px-2 py-0.5 text-[11px] font-bold text-on-accent">Save {saving}%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/* Free */}
        <div className="rounded-3xl bg-bg p-1.5 shadow-[0_4px_30px_rgba(18,18,17,0.04)] ring-1 ring-line">
          <div className="flex h-full flex-col rounded-2xl bg-surface p-6 sm:p-8">
            <h2 className="text-lg font-bold">Free</h2>
            <p className="mt-1 text-sm text-muted">Everything a church needs to start, for good.</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-[-0.03em] tabular-nums">{money(0)}</span>
              <span className="text-muted">forever</span>
            </p>
            <p className="mt-1 text-sm text-faint">No card needed.</p>
            <Link href="/signup" className="mt-6 flex h-12 items-center justify-center rounded-full bg-ink text-sm font-bold text-bg transition hover:opacity-85">
              Start free
            </Link>
            <Features title="Includes" items={FREE_FEATURES} />
          </div>
        </div>

        {/* Paid */}
        <div className="rounded-3xl bg-bg p-1.5 shadow-[0_4px_30px_rgba(18,18,17,0.08)] ring-2 ring-accent-fill">
          <div className="flex h-full flex-col rounded-2xl bg-surface p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Paid</h2>
              <span className="rounded-full bg-accent-fill px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-on-accent uppercase">No limits</span>
            </div>
            <p className="mt-1 text-sm text-muted">For churches that make the screen their own.</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-[-0.03em] tabular-nums">{money(yearly ? price.yearly : price.monthly)}</span>
              <span className="text-muted">{yearly ? "per year" : "per month"}</span>
            </p>
            <p className="mt-1 text-sm text-faint">
              {yearly
                ? `${perMonthText} a month, billed yearly. You save ${money(price.monthly * 12 - price.yearly)}.`
                : `Or ${money(price.yearly)} a year: save ${saving}%.`}
            </p>
            <Link
              href="/signup"
              className="mt-6 flex h-12 items-center justify-center rounded-full bg-accent-fill text-sm font-bold text-on-accent transition hover:brightness-105"
            >
              Start free, upgrade anytime
            </Link>
            <Features title="Everything in Free, plus" items={PAID_EXTRAS} />
          </div>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-ink/60">
        Every church starts on Free. Prices in {price.currency === "NGN" ? "Nigerian naira" : price.currency === "CAD" ? "Canadian dollars" : "US dollars"}.
      </p>
    </div>
  );
}

function Features({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className="mt-8">
      <p className="text-xs font-bold tracking-wide text-faint uppercase">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {items.map((f) => (
          <li key={f} className={`flex gap-2.5 text-[15px] leading-snug ${muted ? "text-muted" : ""}`}>
            <Check size={17} className="mt-0.5 shrink-0 text-accent" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
