"use client";

import { cn } from "@/lib/utils";
import type { JournalBasis } from "@/lib/data";

/**
 * Two-option pill switch for how a journal account's percent returns become
 * money: compounded on running equity, or a fixed share of the starting
 * balance. Used in the import preview and in the header for journal accounts.
 */
export function BasisSwitch({
  value,
  onChange,
  className,
}: {
  value: JournalBasis;
  onChange: (b: JournalBasis) => void;
  className?: string;
}) {
  const options: { id: JournalBasis; label: string }[] = [
    { id: "compounded", label: "Compounded" },
    { id: "fixed", label: "Fixed %" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="P&L basis"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-raised p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 ease-out",
            value === o.id
              ? "bg-overlay text-ink"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
