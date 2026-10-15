"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

/**
 * Put inside a <Link>: shows its children normally, and a spinner from the
 * moment the link is clicked until the next page is ready. Gives every link
 * instant feedback, even before the page's loading placeholder appears.
 */
export function PendingIcon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle size={size} className="shrink-0 animate-spin" /> : <>{children}</>;
}
