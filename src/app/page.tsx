import { BookOpen, Cast, Check, ClipboardPaste, Globe, Languages, ListMusic, PencilLine, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { Features } from "@/components/landing/features";
import { heroBackground } from "@/components/landing/gradient";
import { AmbientFragments, TypedHeadline } from "@/components/landing/hero";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { APP_NAME, SITE_DESCRIPTION, SITE_URL } from "@/lib/brand";
import { getSessionUser } from "@/lib/supabase/server";

// Layout after terms.so: a tall gradient hero with a typed headline, product
// cards that rise out of it, and a quiet footer. Colours stay Spotify: the
// gradient runs from near-black through deep green into the brand green,
// then melts into the page background, so it works in both themes.

const HEADLINE = [
  "Put every verse on screen with AI.",
  "Display lyrics as you worship.",
  "Switch translations in milliseconds.",
  "Get started with ease.",
];

// The two halves of a service, side by side under the hero.
const SIDES = [
  {
    art: "/landing/side-scripture.webp",
    name: "Scripture",
    lead: "For the sermon",
    points: ["Picks every reference out of the sermon", "Switches translation when the preacher asks", "Search any verse and step through the chapter"],
  },
  {
    art: "/landing/side-worship.webp",
    name: "Worship",
    lead: "For praise and worship",
    points: ["Follows the singing, line by line", "Playlists for the songs you've planned", "Paste lyrics from anywhere"],
  },
];

const STEPS = [
  { title: "Set up your church", body: "Create an account, name your church and invite your media team.", art: "/landing/step-setup.webp" },
  { title: "Connect the sound", body: "Pick the sound desk feed, then open the output on your projector or livestream.", art: "/landing/step-sound.webp" },
  { title: "Start the service", body: "Press Start and it follows the sermon and the singing. Or click anything to show it yourself.", art: "/landing/step-start.webp" },
];
const FACTS = [
  { icon: Globe, label: "Nothing to install" },
  { icon: Cast, label: "Projector and livestream" },
  { icon: Sparkles, label: "Free while we pilot" },
];

const HIGHLIGHTS = [
  { icon: Languages, title: "Translations on request", body: "“In the King James” switches it, there and then." },
  { icon: ListMusic, title: "Playlists", body: "Plan the set; it listens for those songs first." },
  { icon: ClipboardPaste, title: "Paste any lyrics", body: "From Google or a lyrics site, split into clean slides." },
  { icon: PencilLine, title: "Change words live", body: "Choir sings it differently? Edit the slide for today." },
  { icon: Cast, title: "Projector and livestream", body: "One output page for the projector and vMix." },
  { icon: Globe, title: "Nothing to install", body: "Runs in Chrome or Edge. Log in from any computer." },
];


export const metadata = { alternates: { canonical: "/" } };

// What search engines read about the product (schema.org), alongside the page.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: APP_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/app-icon-512.png`,
    },
    {
      "@type": "SoftwareApplication",
      name: APP_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "MultimediaApplication",
      applicationSubCategory: "Church presentation software",
      operatingSystem: "Windows, macOS, ChromeOS (web browser)",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free plan" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    { "@type": "WebSite", name: APP_NAME, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#organization` } },
  ],
};

export default async function Home() {
  // Everyone sees the home page; signed in, the header offers the console.
  const signedIn = !!(await getSessionUser());

  return (
    // The gradient sits behind the top of the page at a fixed height; its green
    // peak falls behind the step cards rising out of the hero.
    <div className="min-h-dvh [--hero-h:860px] sm:[--hero-h:880px]" style={heroBackground}>
      {/* Fixed text from this file only (no user input), so it can go in as is. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <section className="relative">
        <AmbientFragments />
        <div className="relative mx-auto max-w-[60rem] px-5 sm:px-8">
          <SiteHeader home signedIn={signedIn} />

          {/* Room for the floating header (24 px + 54 px) above the headline. */}
          <div className="pt-36 pb-[19rem] sm:pt-44 sm:pb-[22rem]">
            {/* 20% smaller than the pricing page's headline. */}
            <TypedHeadline lines={HEADLINE} size="leading-[1.18] text-[2.08rem] sm:text-[2.88rem] lg:text-[3.28rem]" />
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="label-caps inline-flex h-12 items-center rounded-full bg-white px-7 text-xs text-black transition hover:scale-[1.03]"
              >
                Set up your church
              </Link>
              <a
                href="#how"
                className="label-caps inline-flex h-12 items-center gap-2 rounded-full bg-white/12 px-6 text-xs text-white backdrop-blur transition hover:bg-white/20"
              >
                <Play size={14} className="fill-current" /> See it work
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="relative mx-auto -mt-[15rem] max-w-[60rem] scroll-mt-28 px-3 sm:-mt-[18rem] sm:px-8">
        {/* Three steps, first out of the hero. Sizes and spacing taken from
            gettakecontrol.app's steps section (964 px wide, 24 px padding,
            32 px corners, 34 px numbers, a 148 px illustration slot, 18/22 and
            16/20 text). Each step has a 3D icon that floats gently, one after
            another (step-float in globals.css). */}
        <div className="mx-auto mt-12 max-w-[964px] lg:-mx-[34px]">
          <div className="ml-[27px] inline-flex items-center gap-2.5 rounded-t-2xl bg-surface px-4 py-2">
            <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-accent-fill text-on-accent">
              <BookOpen size={10} strokeWidth={2} />
            </span>
            <p className="text-sm leading-4 font-semibold tracking-[-0.14px] text-muted">
              Up and running in <strong className="font-semibold text-ink">3 steps</strong> :
            </p>
          </div>
          <ol className="grid drop-shadow-[0_6px_6px_rgba(18,18,17,0.04)] md:grid-cols-3">
            {STEPS.map(({ title, body, art }, i) => (
              <li
                key={title}
                className="flex flex-col bg-bg p-6 first:rounded-t-[32px] last:rounded-b-[32px] not-first:border-t-[0.8px] not-first:border-line md:first:rounded-l-[32px] md:first:rounded-tr-none md:last:rounded-r-[32px] md:last:rounded-bl-none md:not-first:border-t-0 md:not-first:border-l-[0.8px]"
              >
                <span className="mb-1 grid h-[34px] w-[34px] place-items-center rounded-full bg-surface-2 text-lg font-semibold tabular-nums">{i + 1}</span>
                {/* The step's 3D icon, floating; each starts a beat after the last. */}
                <div className="mb-4 flex h-28 items-center justify-center md:h-[148px]" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed WebP, already sized */}
                  <img
                    src={art}
                    alt=""
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="step-float h-28 w-28 object-contain drop-shadow-[0_18px_22px_rgba(18,18,17,0.18)] md:h-[148px] md:w-[148px]"
                    style={{ animationDelay: `${i * -1.6}s` }}
                  />
                </div>
                <h2 className="mb-3 text-lg leading-[22px] font-semibold tracking-[-0.18px]">{title}</h2>
                <p className="text-base leading-5 font-medium text-muted">{body}</p>
              </li>
            ))}
          </ol>
          <ul className="mt-[34px] mb-28 flex flex-wrap justify-center gap-x-[30px] gap-y-3">
            {FACTS.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2 text-[15px] font-medium text-muted">
                <Icon size={18} /> {label}
              </li>
            ))}
          </ul>
        </div>

        {/* One tool for the whole service. */}
        <div className="mb-12 grid gap-3 sm:grid-cols-2">
          {SIDES.map(({ art, name, lead, points }) => (
            // The media-desk frame: a page-coloured 6 px frame round a grey card.
            <div key={name} className="rounded-3xl bg-bg p-1.5 shadow-[0_4px_30px_rgba(18,18,17,0.04)]">
              <div className="h-full rounded-2xl bg-surface p-6 sm:p-7">
              <div className="flex items-center gap-3">
                {/* 3D icon, still (only the steps above float). */}
                {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed WebP, already sized */}
                <img
                  src={art}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_10px_12px_rgba(18,18,17,0.18)]"
                />
                <div>
                  <h2 className="text-xl leading-tight font-bold">{name}</h2>
                  <p className="text-sm text-muted">{lead}</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5">
                {points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-[15px] leading-snug">
                    <Check size={17} className="mt-0.5 shrink-0 text-accent" />
                    {p}
                  </li>
                ))}
              </ul>
              </div>
            </div>
          ))}
        </div>
        <Features />
      </section>

      {/* One rounded panel of soft tiles with hairline gaps, after
          gettakecontrol.app's feature grid. */}
      <section className="mx-auto max-w-[60rem] px-3 pt-48 sm:px-8">
        <h2 className="mx-auto max-w-md text-center text-3xl leading-[1.15] font-medium tracking-[-0.02em] sm:text-[2.6rem]">
          Made for the media desk.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-lg text-muted">The small things that make Sunday calmer for the people at the back.</p>
        <div className="mt-10 rounded-3xl bg-bg p-1.5 shadow-[0_4px_30px_rgba(18,18,17,0.04)]">
          <div className="grid gap-1 overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-8 bg-surface p-6 transition-colors duration-200 hover:bg-surface-2">
                <Icon size={19} className="text-ink" />
                <div>
                  <h3 className="text-lg leading-snug font-semibold">{title}</h3>
                  <p className="mt-1.5 text-[15px] leading-snug text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[60rem] px-5 py-48 text-center sm:px-8">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready for Sunday?</h2>
        <p className="mx-auto mt-3 max-w-md text-lg text-muted">Setting up takes a few minutes. You need a computer with Chrome or Edge, the sound desk feed, and a projector.</p>
        <Link
          href="/signup"
          className="label-caps mt-8 inline-flex h-12 items-center rounded-full bg-accent-fill px-8 text-xs text-on-accent transition hover:scale-[1.03]"
        >
          Set up your church
        </Link>
      </section>

      <SiteFooter home />
    </div>
  );
}
