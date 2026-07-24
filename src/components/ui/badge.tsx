import { cn } from "@/lib/utils";

type Tone = "neutral" | "profit" | "loss" | "warn" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-raised text-ink-secondary",
  profit: "border-transparent bg-profit-soft text-profit",
  loss: "border-transparent bg-loss-soft text-loss",
  warn: "border-transparent bg-warn-soft text-warn",
  accent: "border-transparent bg-accent-soft text-accent",
};

export function Badge({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5",
        "text-[11.5px] leading-5 font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {/* Shape cue so state is never conveyed by color alone. */}
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
