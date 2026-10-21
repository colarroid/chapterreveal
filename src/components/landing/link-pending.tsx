"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";

/**
 * A spinner inside a Link while the page it leads to loads, so a click on
 * a slower page (the console) never looks ignored. Must sit inside the Link.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle size={15} className="-ml-0.5 animate-spin" aria-label="Loading" /> : null;
}
