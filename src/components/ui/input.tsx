import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-line bg-raised px-3",
        "text-body text-ink placeholder:text-ink-muted",
        "transition-colors duration-150 ease-out",
        "hover:border-line-strong focus:border-accent focus:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function SearchInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <Input className="pl-9" type="search" {...props} />
    </div>
  );
}

/** Segmented control — used for the chart time range. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-md border border-line bg-raised p-0.5"
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={cn(
              "h-7 rounded-sm px-2.5 text-label font-medium",
              "transition-colors duration-150 ease-out",
              active
                ? "bg-overlay text-ink"
                : "text-ink-muted hover:text-ink-secondary",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
