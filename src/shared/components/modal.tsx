"use client";

import { useEffect, useRef } from "react";

/**
 * Accessible modal built on the native `<dialog>` element.
 *
 * `showModal()` gives us focus trapping, Escape-to-close, background inertness,
 * and `::backdrop` from the platform — all things a div-based modal has to
 * reimplement and usually gets wrong. What the platform does *not* do is lock
 * page scroll, so that part is handled here.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional supporting line, wired to `aria-describedby`. */
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // The platform keeps the background inert but still lets the page scroll
  // underneath, which reads as broken on mobile.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" }[size];

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      aria-describedby={description ? "modal-description" : undefined}
      // `cancel` fires on Escape; let the parent own the state either way.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      // A click landing on the dialog itself (not its content) is the backdrop.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      // `m-auto` is load-bearing: a modal <dialog> is centred by the UA
      // stylesheet's `margin: auto` against `inset: 0`, and Tailwind's preflight
      // resets `margin: 0` on every element — which drops the dialog into the
      // top-left corner. `max-h`/`overflow-auto` keep a tall body inside the
      // viewport instead of running off the bottom.
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-auto ${width} rounded-modal border border-border-subtle bg-surface p-0 text-foreground shadow-md backdrop:bg-background/50`}
    >
      {/* Inner wrapper: clicks here must not reach the backdrop handler. */}
      <div onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-base font-semibold">
              {title}
            </h2>
            {description && (
              <p id="modal-description" className="mt-0.5 text-sm text-text-secondary">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-me-1 -mt-1 shrink-0 rounded-btn p-1.5 text-text-tertiary transition hover:bg-surface-raised hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
