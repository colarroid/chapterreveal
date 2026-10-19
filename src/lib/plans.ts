// What each plan includes. The database enforces the same numbers
// (supabase/migrations 0016 and 0021, plan_limit); keep them in step. Only
// a church's own uploads, saved gradients and picture/video slides count:
// the shared library from the admin site is free for everyone.

export type Plan = "free" | "paid";

export interface Limits {
  image: number;
  video: number;
  gradient: number;
  /** Picture and video slides kept at a time (each kept 7 days on Free). */
  slide: number;
  /** Pictures on one picture slide, shown side by side. */
  slideImages: number;
  /** Video slides allowed at all. */
  videoSlides: boolean;
}

export const PLAN_LIMITS: Record<Plan, Limits> = {
  free: { image: 5, video: 2, gradient: 10, slide: 10, slideImages: 3, videoSlides: false },
  paid: { image: Infinity, video: Infinity, gradient: Infinity, slide: Infinity, slideImages: 6, videoSlides: true },
};

export const planName = (plan: Plan) => (plan === "paid" ? "Paid" : "Free");

/** "5 pictures", "2 videos", "10 gradients". */
export function limitText(kind: "image" | "video" | "gradient" | "slide", n: number): string {
  if (kind === "slide") return `${n} picture and video slide${n === 1 ? "" : "s"}`;
  const word = kind === "image" ? "picture" : kind;
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The Paid plan's price in one currency. */
export interface Price {
  currency: "USD" | "NGN" | "CAD";
  monthly: number;
  yearly: number;
}

/** US dollars: the United States and everywhere without its own price. */
export const DEFAULT_PRICE: Price = { currency: "USD", monthly: 10, yearly: 80 };

/** Set prices in local currency, by country code (not live exchange rates). */
const LOCAL_PRICES: Record<string, Price> = {
  NG: { currency: "NGN", monthly: 13_000, yearly: 104_000 },
  CA: { currency: "CAD", monthly: 14, yearly: 110 },
};

/** The Paid price for a visitor's country (from the request; US dollars when unknown). */
export const priceFor = (country?: string | null): Price => LOCAL_PRICES[(country ?? "").toUpperCase()] ?? DEFAULT_PRICE;

/** "$10", "₦13,000", "CA$14", "$6.67". */
export function formatPrice(amount: number, currency: Price["currency"]): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    // "₦13,000" (the default writes "NGN 13,000"); Canadian dollars keep "CA$" so they're not read as US dollars.
    currencyDisplay: currency === "NGN" ? "narrowSymbol" : "symbol",
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
