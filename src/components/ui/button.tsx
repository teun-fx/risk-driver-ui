import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press",
  secondary:
    "border border-line bg-raised text-ink hover:border-line-strong hover:bg-overlay active:bg-raised",
  ghost:
    "text-ink-secondary hover:bg-overlay hover:text-ink active:bg-raised",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-label",
  md: "h-9 gap-2 px-3.5 text-label",
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap",
        "transition-colors duration-150 ease-out",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

/** Square icon-only button. Always pass an aria-label. */
export function IconButton({
  className,
  variant = "ghost",
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
        "transition-colors duration-150 ease-out",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-[17px] [&_svg]:shrink-0",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
