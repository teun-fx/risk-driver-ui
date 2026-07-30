import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, money, pct } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  delta,
  caption,
  format,
}: {
  label: string;
  value: number;
  /** Omitted (or 0) when the metric has no meaningful period-over-period
      change — a coloured arrow on a number that has no direction is a false
      signal, so the card shows the caption alone instead. */
  delta?: number;
  caption: string;
  format: "money" | "pct";
}) {
  const hasDelta = delta != null && delta !== 0;
  const up = (delta ?? 0) >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card interactive className="p-5">
      <p className="text-eyebrow text-ink-muted">{label}</p>

      <p className="mt-3 text-metric text-ink">
        {format === "money" ? money(value) : pct(value)}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {/* Arrow + sign, so direction never depends on color alone. */}
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-label font-medium tnum",
              up ? "text-profit" : "text-loss",
            )}
          >
            <Arrow className="size-3.5" aria-hidden />
            {pct(delta as number, { signed: true })}
          </span>
        )}
        <span className="text-label text-ink-muted">{caption}</span>
      </div>
    </Card>
  );
}
