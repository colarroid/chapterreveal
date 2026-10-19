import { headers } from "next/headers";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { APP_NAME } from "@/lib/brand";
import { DEFAULT_PRICE, formatPrice, priceFor } from "@/lib/plans";
import { getSessionUser } from "@/lib/supabase/server";
import { heroBackground } from "@/components/landing/gradient";
import { TypedHeadline } from "@/components/landing/hero";
import { Faq } from "@/components/landing/faq";
import { PricingPlans } from "./plans";

export const metadata = {
  title: "Pricing",
  description: `${APP_NAME} is free to start. Paid is ${formatPrice(DEFAULT_PRICE.monthly, "USD")} a month, or ${formatPrice(DEFAULT_PRICE.yearly, "USD")} a year, for unlimited backgrounds, designs and slides.`,
  alternates: { canonical: "/pricing" },
};

const FAQ: [string, string][] = [
  [
    "Do we need a card to start?",
    `No. Every church starts on Free, with no card. Sign up, name your church and ${APP_NAME} is ready for Sunday.`,
  ],
  [
    "What's the same on both plans?",
    "Everything that puts words on screen: hearing the preacher and the singing, every Bible translation we offer, the song library, playlists, text and picture slides, the projector and livestream outputs, history and offline Bibles.",
  ],
  [
    "What changes on Paid?",
    "You get video slides, and instant access to new features and updates as soon as they're released.",
  ],
  [
    "Can we switch back to Free?",
    "Yes. Everything you made stays; you just can't add beyond the Free allowance until you upgrade again.",
  ],
];

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  // Prices in the visitor's currency: Vercel says which country the request
  // came from. ?country=NG (or CA, US) shows another country's prices.
  const { country } = await searchParams;
  const price = priceFor(country ?? (await headers()).get("x-vercel-ip-country"));
  const signedIn = !!(await getSessionUser());
  return (
    // Green peak behind the top of the plan cards.
    <div className="min-h-dvh [--hero-h:700px] sm:[--hero-h:760px]" style={heroBackground}>
      <SiteHeader signedIn={signedIn} />
      {/* After terms.so's pricing page: a tall gradient with the headline and
          a short intro on the left, and the plans sitting where it fades into
          the page. ReedArk's own gradient, type and words. */}
      <main>
      <section>
        {/* Room for the floating header (24 px + 54 px) above the headline. */}
        <div className="mx-auto max-w-[60rem] px-5 pt-36 pb-10 sm:px-8 sm:pt-44">
          {/* White on the dark top of the gradient; the plans below keep the page's colours. */}
          <div className="text-white">
            <TypedHeadline lines={["Simple pricing", "for every church."]} />
            <p className="mt-10 max-w-[31rem] text-base leading-[1.35] font-medium tracking-[-0.01em] sm:mt-14">
              <strong className="text-white/90">Start free, with everything that puts scripture and lyrics on screen.</strong>{" "}
              <span className="text-white/60">Upgrade when your church needs more room. No card needed, and every church begins on Free.</span>
            </p>
          </div>
          <PricingPlans price={price} />
        </div>
      </section>

      <div className="mt-24">
        <Faq
          title={
            <>
              Questions churches
              <br />
              ask us.
            </>
          }
          items={FAQ}
        />
      </div>
      </main>
      <SiteFooter />
    </div>
  );
}
