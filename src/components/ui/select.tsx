"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native select in the Input's clothes — dropdown filters, zero JS. */
export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-block", className)}>
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-line bg-raised pr-8 pl-3",
          "text-body text-ink",
          "transition-colors duration-150 ease-out",
          "hover:border-line-strong focus:border-accent focus:outline-none",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
    </span>
  );
}

/**
 * Borderless dropdown for a card header — the reference activity card's
 * "Weekly ⌄" control. A listbox rather than a native select so the trigger can
 * be plain text with a chevron and the menu can wear the app's overlay
 * surface. Closes on outside click and on Escape.
 */
export function MenuSelect<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-2 text-label font-medium text-ink",
          "transition-colors duration-150 ease-out hover:bg-raised",
        )}
      >
        {value}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-ink-muted transition-transform duration-150 ease-out",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute top-full right-0 z-50 mt-1.5 min-w-32 overflow-hidden rounded-md border border-line bg-overlay py-1 shadow-pop"
        >
          {options.map((opt) => (
            <button
              key={opt}
              role="option"
              aria-selected={opt === value}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-left text-label",
                "transition-colors duration-150 ease-out hover:bg-raised",
                opt === value ? "text-ink" : "text-ink-secondary",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
