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
  delta: number;
  caption: string;
  format: "money" | "pct";
}) {
  const up = delta >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card interactive className="p-5">
      <p className="text-eyebrow text-ink-muted">{label}</p>

      <p className="mt-3 text-metric text-ink">
        {format === "money" ? money(value) : pct(value)}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {/* Arrow + sign, so direction never depends on color alone. */}
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-label font-medium tnum",
            up ? "text-profit" : "text-loss",
          )}
        >
          <Arrow className="size-3.5" aria-hidden />
          {pct(delta, { signed: true })}
        </span>
        <span className="text-label text-ink-muted">{caption}</span>
      </div>
    </Card>
  );
}
