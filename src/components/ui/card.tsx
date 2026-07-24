import { cn } from "@/lib/utils";

export function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface",
        interactive &&
          "transition-colors duration-200 ease-out hover:border-line-strong",
        className,
      )}
      {...props}
    />
  );
}

/** Card header. `bordered` adds the hairline used on table/list cards. */
export function CardHeader({
  className,
  bordered = false,
  ...props
}: React.ComponentProps<"div"> & { bordered?: boolean }) {
  return (
    <div
      className={cn(
        // Wraps rather than overflowing when a header carries a control.
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 py-4",
        bordered && "border-b border-line",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-title text-ink", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-label text-ink-muted", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}
