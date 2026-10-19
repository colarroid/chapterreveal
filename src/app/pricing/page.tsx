import { headers } from "next/headers";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { APP_NAME } from "@/lib/brand";
import { DEFAULT_PRICE, formatPrice, priceFor } from "@/lib/plans";
import { getSessionUser } from "@/lib/supabase/server";
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
    "Everything that puts words on screen: hearing the preacher and the singing, every Bible translation we offer, the song library, playlists, slides, the projector and livestream outputs, history and offline Bibles.",
  ],
  [
    "What changes on Paid?",
    "No limits on your own pictures, videos, saved gradients or picture and video slides, and slides are kept until you delete them instead of 7 days.",
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
    <div className="min-h-dvh">
      <SiteHeader signedIn={signedIn} />
      {/* Room for the floating header (24 px + 54 px). */}
      <main className="mx-auto max-w-[60rem] px-5 pt-36 pb-24 sm:px-8 sm:pt-40">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-[clamp(2.2rem,6vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">Simple pricing for every church</h1>
          <p className="mt-4 text-lg text-muted text-balance">Start free, with everything that puts scripture and lyrics on screen. Upgrade when your church needs more room.</p>
        </div>

        <PricingPlans price={price} />

        <section className="mx-auto mt-24 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Questions</h2>
          <dl className="mt-6 divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <div key={q} className="py-5">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1.5 text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
