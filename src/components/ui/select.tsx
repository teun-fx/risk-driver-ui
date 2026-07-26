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
