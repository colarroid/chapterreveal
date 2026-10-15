"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "./ui";

// A styled confirm, in place of the browser's confirm() box:
//   if (!(await confirmDialog({ title: "Delete this song?", confirmLabel: "Delete", danger: true }))) return;
// <ConfirmHost /> sits once in the root layout and shows whichever is asked.

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, and Cancel takes the focus so Enter can't destroy anything. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // A second request while one is open answers the first with "no".
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const p = current;
  current = null;
  emit();
  p?.resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ConfirmHost() {
  const pending = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  // Keep the last request on screen while the dialog closes.
  const [shown, setShown] = useState<Pending | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (pending) {
      setShown(pending);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [pending]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="confirm-title"
      // Esc: the browser closes the dialog; count it as "no".
      onCancel={(e) => {
        e.preventDefault();
        settle(false);
      }}
      // Keys answer the dialog only, never the page behind it (Esc there blanks the projector).
      onKeyDown={(e) => e.stopPropagation()}
      // A click on the dimmed backdrop lands on the dialog element itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) settle(false);
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-xl bg-menu p-0 text-ink shadow-pop ring-1 ring-line backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
    >
      {shown && (
        <div className="p-6">
          <div className="flex items-start gap-3">
            {shown.danger && (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-negative/15 text-negative">
                <TriangleAlert size={18} />
              </span>
            )}
            <div className="min-w-0">
              <h2 id="confirm-title" className="text-lg leading-snug font-bold">
                {shown.title}
              </h2>
              {shown.body && <p className="mt-1 text-sm leading-snug text-muted">{shown.body}</p>}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" autoFocus={shown.danger} onClick={() => settle(false)}>
              {shown.cancelLabel ?? "Cancel"}
            </Button>
            <Button variant={shown.danger ? "danger" : "primary"} autoFocus={!shown.danger} onClick={() => settle(true)}>
              {shown.confirmLabel ?? "OK"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
