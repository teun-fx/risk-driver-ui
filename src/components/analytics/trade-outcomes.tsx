"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, type DonutChartSegment } from "@/components/ui/donut-chart";
import { tradeOutcomes, type Account } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Outcome donut in the reference DonutChart's anatomy — animated draw-in,
 * hover glow, center content that crossfades to the hovered slice — on the
 * app's own semantic tokens: win = profit, loss = loss, break-even = neutral
 * ink. Identity is never colour-alone; the legend names every slice with its
 * count and share, and hovering either side highlights the other.
 */

type Slice = DonutChartSegment & {
  /** What the center reads when this slice is hovered, e.g. "Win rate". */
  rate: string;
  pct: number;
};

export function TradeOutcomes({ account }: { account: Account }) {
  const o = tradeOutcomes(account);
  const [hovered, setHovered] = useState<string | null>(null);

  const slices: Slice[] = [
    {
      label: "Wins",
      rate: "Win rate",
      value: o.wins,
      pct: o.winPct,
      color: "var(--color-profit)",
    },
    {
      label: "Break-even",
      rate: "Break-even rate",
      value: o.breakEven,
      pct: o.breakEvenPct,
      color: "var(--color-ink-muted)",
    },
    {
      label: "Losses",
      rate: "Loss rate",
      value: o.losses,
      pct: o.lossPct,
      color: "var(--color-loss)",
    },
  ];

  const active = slices.find((s) => s.label === hovered) ?? null;
  const centerPct = active ? active.pct : slices[0].pct;
  const centerLabel = active ? active.rate : "Win rate";

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader>
        <CardTitle>Trade outcomes</CardTitle>
        <span className="text-label text-ink-muted">
          {o.total.toLocaleString("en-US")} trades
        </span>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        {/* Donut takes the freed space so the card stands level with the
            chart beside it. */}
        <div
          className="flex flex-1 items-center justify-center py-2"
          role="img"
          aria-label={`Of ${o.total} trades: ${o.winPct} percent wins, ${o.breakEvenPct} percent break-even, ${o.lossPct} percent losses`}
        >
          <DonutChart
            data={slices}
            size={208}
            strokeWidth={16}
            animationDuration={1.2}
            animationDelayPerSegment={0.05}
            activeLabel={hovered}
            onSegmentHover={(s) => setHovered(s?.label ?? null)}
            centerContent={
              <AnimatePresence mode="wait">
                <motion.div
                  key={centerLabel}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, ease: "circOut" }}
                  className="flex flex-col items-center justify-center text-center"
                >
                  <p className="text-metric text-ink">{centerPct}%</p>
                  <p className="mt-0.5 text-label text-ink-muted">
                    {centerLabel}
                  </p>
                  {active && (
                    <p className="mt-1 text-[11.5px] tnum text-ink-secondary">
                      {active.value.toLocaleString("en-US")} trades
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            }
          />
        </div>

        {/* Legend — identity carried by label + count, never colour alone.
            Hovering a row highlights the matching donut segment and vice versa. */}
        <dl className="mt-2 space-y-1">
          {slices.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2 + i * 0.1, duration: 0.4 }}
              onMouseEnter={() => setHovered(s.label)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1 transition-colors duration-150 ease-out",
                hovered === s.label ? "bg-raised" : "hover:bg-raised/60",
              )}
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: s.color }}
                aria-hidden
              />
              <dt className="text-label text-ink-secondary">{s.label}</dt>
              <dd className="ml-auto text-label tnum text-ink-muted">
                {s.value.toLocaleString("en-US")} trades
              </dd>
              <dd className="w-10 text-right text-label tnum font-medium text-ink">
                {s.pct}%
              </dd>
            </motion.div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
