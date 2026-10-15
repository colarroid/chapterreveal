// What each plan includes. The database enforces the same numbers
// (supabase/migrations/0016_church_design_limits.sql); keep them in step.
// Only a church's own uploads and saved gradients count: the shared library
// from the admin site is free for everyone.

export type Plan = "free" | "paid";

export interface Limits {
  image: number;
  video: number;
  gradient: number;
}

export const PLAN_LIMITS: Record<Plan, Limits> = {
  free: { image: 5, video: 2, gradient: 10 },
  paid: { image: Infinity, video: Infinity, gradient: Infinity },
};

export const planName = (plan: Plan) => (plan === "paid" ? "Paid" : "Free");

/** "5 pictures", "2 videos", "10 gradients". */
export function limitText(kind: keyof Limits, n: number): string {
  const word = kind === "image" ? "picture" : kind;
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
