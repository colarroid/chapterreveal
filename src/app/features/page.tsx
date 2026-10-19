import {
  AudioLines,
  BookOpen,
  Cast,
  CircleOff,
  ClipboardPaste,
  CornerDownRight,
  Download,
  Globe,
  History,
  Images,
  KeyRound,
  Languages,
  Link2,
  ListMusic,
  Mail,
  Mic,
  MonitorOff,
  MonitorPlay,
  MonitorUp,
  Music,
  Palette,
  PencilLine,
  Presentation,
  Quote,
  Search,
  SlidersHorizontal,
  Star,
  Timer,
  Type,
  Users,
  Video,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { HERO_GRADIENT, TypedHeadline } from "@/components/landing/hero";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { APP_NAME } from "@/lib/brand";
import { PLAN_LIMITS } from "@/lib/plans";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Features",
  description: `Everything ${APP_NAME} does for the media desk: scripture that follows the sermon, lyrics that follow the singing, slides, projector and livestream outputs, and your church's service history.`,
  alternates: { canonical: "/features" },
};

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Only on the Paid plan. */
  paid?: boolean;
}

interface Group {
  id: string;
  icon: LucideIcon;
  /** On the jump links under the headline. */
  short: string;
  title: string;
  lead: string;
  features: Feature[];
}

const free = PLAN_LIMITS.free;
const paid = PLAN_LIMITS.paid;

const GROUPS: Group[] = [
  {
    id: "scripture",
    short: "Scripture",
    icon: BookOpen,
    title: "Scripture that follows the sermon",
    lead: "The preacher says it; it's on screen.",
    features: [
      {
        icon: Mic,
        title: "Hears every reference",
        body: "“John 3:16”, “John chapter three verse sixteen”, “Psalm one nineteen”, ranges and lists. Up on screen in under a second.",
      },
      { icon: CornerDownRight, title: "Follow-ups", body: "“Verse 17”, “go down to verse 20”, “chapter four verse two”: it remembers where the preacher is." },
      { icon: Quote, title: "Quoted verses", body: "Scripture read or quoted from memory, with no reference said, is recognised from its words." },
      { icon: Link2, title: "Pauses don't break it", body: "“Second Peter…” then “…chapter three verse seven” after a pause is joined back into one reference." },
      { icon: Zap, title: "Auto, or by hand", body: "Auto puts clear references straight up. Or every heard reference waits for a click, or Alt and a number." },
      { icon: CircleOff, title: "Says when a verse doesn't exist", body: "Misspoke “2 Peter 4”? The operator sees a note that 2 Peter has 3 chapters. Never projected." },
      { icon: AudioLines, title: "Voice commands", body: "“Next verse” and “previous verse” step through the passage as they're said." },
      { icon: Search, title: "Search and step", body: "Type “jn 3 16”, jump with a verse number, step with the arrow keys. Long verses split cleanly across slides." },
    ],
  },
  {
    id: "translations",
    short: "Translations",
    icon: Languages,
    title: "Bible translations",
    lead: "The one your church reads, switched in milliseconds.",
    features: [
      { icon: Languages, title: "Switch on request", body: "“Give me the NKJV” or “the New Living Translation”: it switches there and then." },
      { icon: BookOpen, title: "Popular translations", body: "KJV, NKJV, NLT, ASV, BSB, Young's Literal and more, with each publisher's credit line shown." },
      { icon: Star, title: "Favourites first", body: "Star the translations your church uses and they stay at the top of the list." },
      { icon: Download, title: "Works without internet", body: "Each translation is kept on the computer after first use, so a weak connection never stops the verses." },
    ],
  },
  {
    id: "worship",
    short: "Worship",
    icon: Music,
    title: "Lyrics that follow the singing",
    lead: "Praise and worship, without the slide guessing.",
    features: [
      { icon: AudioLines, title: "Follows the singing", body: "It listens and moves the lyrics line by line. Or let it only suggest, and you decide." },
      { icon: Music, title: "Song library", body: "A shared library of worship songs plus your church's own. Search by title or any line." },
      { icon: ListMusic, title: "Playlists", body: "Plan the set for Sunday; it listens for those songs first." },
      { icon: ClipboardPaste, title: "Paste any lyrics", body: "From Google or a lyrics site, split into clean slides with the extra text taken out." },
      { icon: PencilLine, title: "Change words live", body: "Choir sings it differently? Edit the slide for today; the library copy stays as it is." },
    ],
  },
  {
    id: "slides",
    short: "Slides",
    icon: Presentation,
    title: "Slides",
    lead: "Announcements, pictures and videos in the same place.",
    features: [
      { icon: Type, title: "Text slides", body: "Announcements and notices, shown in your lyrics style." },
      { icon: Images, title: "Picture slides", body: `Up to ${free.slideImages} pictures side by side on one slide (${paid.slideImages} on Paid). On Free, pictures are kept 7 days.` },
      { icon: Video, title: "Video slides", body: "Play a video once, with sound, on the projector.", paid: true },
      { icon: SlidersHorizontal, title: "Order and go live", body: "Drag slides into order. Double-click one to put it up; the Live switch blanks the screen." },
    ],
  },
  {
    id: "screens",
    short: "Screens",
    icon: Cast,
    title: "Projector and livestream",
    lead: "One console, every screen in the building and online.",
    features: [
      { icon: MonitorUp, title: "Projector in one click", body: "Present opens the output full screen on the projector, with no address bar showing." },
      { icon: MonitorPlay, title: "Livestream outputs", body: "Scripture and lyrics, full screen or lower third on green, ready to key in vMix or OBS." },
      { icon: KeyRound, title: "Your own address", body: "Give your output a fixed, private address, so vMix and the projector never need setting up again." },
      { icon: MonitorOff, title: "Blank in one key", body: "L goes live, Esc blanks the screen. The preview shows exactly what the room sees." },
      { icon: Palette, title: "Design your screen", body: "Fonts, colours, size and position. Pictures, videos or moving gradients behind the words, separately for scripture and lyrics." },
      { icon: Images, title: "Background library", body: `Ready-made backgrounds to use straight away, plus your own: ${free.image} pictures and ${free.video} videos on Free, unlimited on Paid.` },
    ],
  },
  {
    id: "church",
    short: "Church and team",
    icon: Users,
    title: "Your church and team",
    lead: "Built for the people at the back.",
    features: [
      { icon: Users, title: "Media team", body: "Invite your team with single-use codes. Admins manage the church; operators run the service." },
      { icon: History, title: "Service history", body: "Every service's transcript, with each verse shown marked where it was said." },
      { icon: Mail, title: "Weekly summary", body: "Every Monday, church admins get an email of the week's services: the scriptures shown and the songs sung." },
      { icon: WifiOff, title: "Keeps going offline", body: "If the internet drops, search still works and the transcript is saved, then sent when it's back." },
      { icon: Mic, title: "Sound checks", body: "Pick the desk feed, watch the level, and get a warning if it goes silent or clips." },
      { icon: Timer, title: "Ends forgotten services", body: "If nobody presses End, the service stops itself after the silence you choose." },
      { icon: Globe, title: "Nothing to install", body: "Runs in Chrome or Edge on Windows, Mac or Chromebook. Log in from any computer, in light or dark." },
    ],
  },
];

export default async function FeaturesPage() {
  const signedIn = !!(await getSessionUser());
  return (
    <div className="min-h-dvh">
      <SiteHeader signedIn={signedIn} />
      <section style={{ background: HERO_GRADIENT }}>
        {/* Room for the floating header (24 px + 54 px) above the headline. */}
        <div className="mx-auto max-w-[60rem] px-5 pt-36 pb-16 sm:px-8 sm:pt-44 sm:pb-20">
          <div className="text-white">
            <TypedHeadline lines={["Everything it does,", "for every service."]} />
            <p className="mt-10 max-w-[33rem] text-base leading-[1.35] font-medium tracking-[-0.01em] sm:mt-14">
              <strong className="text-white/90">Scripture, lyrics, slides and every screen, run from one console.</strong>{" "}
              <span className="text-white/60">Almost all of it is on the Free plan. Paid adds video slides and more room.</span>
            </p>
          </div>
          {/* Jump to a group. */}
          <nav aria-label="Feature groups" className="mt-10 flex flex-wrap gap-2">
            {GROUPS.map(({ id, icon: Icon, short }) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                <Icon size={15} /> {short}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <main className="mx-auto max-w-[60rem] space-y-24 px-3 pt-16 pb-24 sm:px-8 sm:pt-20">
        {GROUPS.map(({ id, icon: Icon, title, lead, features }) => (
          <section key={id} id={id} className="scroll-mt-28">
            <div className="flex items-center gap-3 px-2 sm:px-0">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-fill text-on-accent">
                <Icon size={20} />
              </span>
              <div>
                <h2 className="text-2xl leading-tight font-semibold tracking-[-0.02em] sm:text-[1.75rem]">{title}</h2>
                <p className="text-muted">{lead}</p>
              </div>
            </div>
            {/* One rounded panel of soft tiles with hairline gaps, as on the home page. */}
            <div className="mt-6 rounded-3xl bg-bg p-1.5 shadow-[0_4px_30px_rgba(18,18,17,0.04)]">
              <div className="grid gap-1 overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-3">
                {features.map(({ icon: FIcon, title: ft, body, paid: isPaid }) => (
                  <div key={ft} className="flex flex-col gap-6 bg-surface p-6 transition-colors duration-200 hover:bg-surface-2">
                    <div className="flex items-center justify-between">
                      <FIcon size={19} className="text-ink" />
                      {isPaid && (
                        <span className="rounded-full bg-accent-fill px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-on-accent uppercase">Paid</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg leading-snug font-semibold">{ft}</h3>
                      <p className="mt-1.5 text-[15px] leading-snug text-muted">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready for Sunday?</h2>
          <p className="mx-auto mt-3 max-w-md text-lg text-muted">Start free. You need a computer with Chrome or Edge, the sound desk feed, and a projector.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="label-caps inline-flex h-12 items-center rounded-full bg-accent-fill px-8 text-xs text-on-accent transition hover:scale-[1.03]"
            >
              {signedIn ? "Open console" : "Set up your church"}
            </Link>
            <Link href="/pricing" className="label-caps inline-flex h-12 items-center rounded-full bg-surface-2 px-8 text-xs transition hover:bg-surface-3">
              See pricing
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
