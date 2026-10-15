import type { ReactNode } from "react";
import { LEGAL } from "@/lib/brand";

// Building blocks for the Terms of Use and Privacy Policy pages.

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {LEGAL.updated}</p>
      <div className="mt-6 text-[17px] leading-relaxed">{intro}</div>
      <div className="mt-10 space-y-10">{children}</div>
    </article>
  );
}

export function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section id={title.toLowerCase().replace(/[^a-z]+/g, "-")} className="scroll-mt-6">
      <h2 className="text-xl font-bold">
        <span className="mr-2 text-muted tabular-nums">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink/90 [&_a]:text-accent [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}

/** A setting from LEGAL, or a visible placeholder until it's filled in. */
export function Fill({ value }: { value: string }) {
  return value ? <>{value}</> : <span className="rounded bg-warning/15 px-1 text-warning">[to be confirmed]</span>;
}

export function ContactEmail() {
  return LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : <Fill value="" />;
}
