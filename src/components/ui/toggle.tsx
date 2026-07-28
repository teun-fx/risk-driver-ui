"use client";

import { cn } from "@/lib/utils";

/**
 * Small on/off switch for chart layers. Same thumb-slide mechanic as the theme
 * toggle, sized down to sit in a list beside a plot. Neutral inks only — the
 * plot itself carries the colour, the switch just reports state.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-sm py-1 text-left",
        "outline-none focus-visible:ring-2 focus-visible:ring-accent",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-150 ease-out",
          checked
            ? "border-ink/20 bg-ink"
            : "border-line bg-raised group-hover:border-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 size-3 rounded-full transition-transform duration-200 ease-out",
            checked ? "translate-x-3 bg-surface" : "translate-x-0 bg-ink-muted",
          )}
        />
      </span>

      <span
        className={cn(
          "truncate text-[11.5px] transition-colors duration-150 ease-out",
          checked ? "text-ink" : "text-ink-muted",
        )}
      >
        {label}
      </span>
    </button>
  );
}
