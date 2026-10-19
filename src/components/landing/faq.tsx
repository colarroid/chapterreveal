"use client";

import { useId, useState, type ReactNode } from "react";

// Questions and answers after gettakecontrol.app's FAQ: a dark band, the
// heading on the left (a small grey tag over a large two-line title), the
// questions on the right with hairlines between them. One open at a time; the
// first starts open. A minus/plus swaps with a quick fade and scale, closed
// questions are grey, and the answer slides open (grid rows 0fr to 1fr),
// indented to line up with the question.

export function Faq({ title, items }: { title: ReactNode; items: [question: string, answer: ReactNode][] }) {
  const [open, setOpen] = useState<number | null>(0);
  const id = useId();
  return (
    <section className="bg-[#121212] px-6 py-20 text-white">
      <div className="mx-auto grid max-w-[964px] items-start gap-8 md:grid-cols-[430px_minmax(0,1fr)] md:gap-10">
        <div>
          <p className="mb-4 text-lg leading-[22px] font-semibold text-white/70">FAQ</p>
          <h2 className="text-[2rem] leading-[1.12] font-medium tracking-[-0.01em] sm:text-4xl sm:leading-10">{title}</h2>
        </div>
        <div className="flex flex-col gap-5">
          {items.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q} className="flex flex-col gap-5">
                {i > 0 && <div className="h-px bg-white/12" aria-hidden />}
                <div>
                  <button
                    type="button"
                    id={`${id}-q${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`${id}-a${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center gap-3.5 text-left text-base leading-5 font-semibold"
                  >
                    <span className="relative h-3.5 w-3.5 shrink-0" aria-hidden>
                      {/* Minus when open, plus when closed. */}
                      <Sign plus={false} shown={isOpen} />
                      <Sign plus shown={!isOpen} />
                    </span>
                    <span className={`transition-colors duration-250 ${isOpen ? "text-white" : "text-white/55 hover:text-white/80"}`}>{q}</span>
                  </button>
                  <div
                    id={`${id}-a${i}`}
                    role="region"
                    aria-labelledby={`${id}-q${i}`}
                    className={`grid transition-[grid-template-rows] duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                  >
                    <div className="overflow-hidden">
                      <p className="pt-3 pl-7 text-base leading-5 font-medium text-white/60">{a}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Sign({ plus, shown }: { plus: boolean; shown: boolean }) {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      className={`absolute inset-0 h-3.5 w-3.5 transition-[opacity,transform] motion-reduce:transition-none ${shown ? "scale-100 opacity-100 duration-200" : "scale-[0.85] opacity-0 duration-120"}`}
    >
      <path d="M2.1875 7H11.8125" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {plus && <path d="M7 2.1875V11.8125" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
