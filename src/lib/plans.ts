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
}

export const PLAN_LIMITS: Record<Plan, Limits> = {
  free: { image: 5, video: 2, gradient: 10, slide: 10 },
  paid: { image: Infinity, video: Infinity, gradient: Infinity, slide: Infinity },
};

export const planName = (plan: Plan) => (plan === "paid" ? "Paid" : "Free");

/** "5 pictures", "2 videos", "10 gradients". */
export function limitText(kind: keyof Limits, n: number): string {
  if (kind === "slide") return `${n} picture and video slide${n === 1 ? "" : "s"}`;
  const word = kind === "image" ? "picture" : kind;
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
