"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A centered modal on a dimming scrim. Closes on Escape, on scrim click, and
 * on the X. The scrim uses a 60% black + blur to signal the background is
 * dismissable (per the modal UX rules), and focus moves into the panel on open.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  leading,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Optional element left of the title, e.g. a back button. */
  leading?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Focus the panel ONLY when it opens. Keeping this out of the effect below
  // is essential: that effect re-runs whenever `onClose` changes identity
  // (every parent render, i.e. every keystroke in a form field), and calling
  // focus() there would steal focus off the input after each character.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  // Escape-to-close and background scroll lock. Safe to re-run on every render.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "my-auto w-full max-w-lg rounded-lg border border-line bg-surface shadow-pop outline-none",
          className,
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {leading}
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-ink">{title}</h2>
            {description && (
              <p className="mt-0.5 text-label text-ink-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-overlay hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
