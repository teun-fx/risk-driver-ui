import { cn } from "@/lib/utils";

type Tone = "accent" | "profit" | "loss" | "warn";

const fills: Record<Tone, string> = {
  accent: "bg-accent",
  profit: "bg-profit",
  loss: "bg-loss",
  warn: "bg-warn",
};

/** Thin horizontal meter. Value is 0–100. */
export function Progress({
  value,
  tone = "accent",
  className,
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full bg-raised", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", fills[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Segmented risk meter — discrete ticks read faster than a continuous bar. */
export function SegmentMeter({
  value,
  segments = 12,
  tone = "accent",
  label,
}: {
  value: number;
  segments?: number;
  tone?: Tone;
  label?: string;
}) {
  const active = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments);
  return (
    <div
      className="flex items-end gap-[3px]"
      role="img"
      aria-label={`${label ?? "Level"}: ${Math.round(value)} percent`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-4 w-1 rounded-xs transition-colors duration-200 ease-out",
            i < active ? fills[tone] : "bg-line",
          )}
        />
      ))}
    </div>
  );
}
