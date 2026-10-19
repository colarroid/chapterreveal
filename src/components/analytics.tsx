"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: page views, no cookies, nothing personal. The
 * projector and livestream pages are left out (their address is the church's
 * private output link), and query strings are dropped (sign-in links carry
 * one-time codes).
 */
export function Analytics() {
  return (
    <VercelAnalytics
      beforeSend={(event) => {
        const url = new URL(event.url);
        if (url.pathname.startsWith("/screen/")) return null;
        return { ...event, url: url.origin + url.pathname };
      }}
    />
  );
}
