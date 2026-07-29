"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipBox, TooltipContent } from "@/components/ui/area-chart";
import { profitDistribution, type Account } from "@/lib/data";
import { cn, money } from "@/lib/utils";

/**
 * Histogram of closed-trade outcomes. Bars are horizontal because the bucket
 * labels are text; fills use the same flat profit/loss ink as the monthly
 * returns table (solid colour at 85%, no gradient) so the two read as one
 * family.
 */
/* Loss bands deepen toward the worst, win bands toward the best, so the
   split bar reads as two families without leaving the dashboard's two
   P&L inks. Order matches the bucket list: worst loss → biggest win. */
const BAND_OPACITY = [1, 0.8, 0.6, 0.4, 0.4, 0.6, 0.8, 1];

export function ProfitDistribution({ account }: { account: Account }) {
  const buckets = useMemo(() => profitDistribution(account), [account]);
  const total = buckets.reduce((a, b) => a + b.count, 0) || 1;

  // Same crossover anatomy as the risk-stats equity curve: the floating
  // tooltip card follows the pointer over the bar area.
  const barRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoverPx, setHoverPx] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverPx({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      w: r.width,
      h: r.height,
    });
  };
  const wins = buckets
    .filter((b) => b.sign === "win")
    .reduce((a, b) => a + b.count, 0);

  const shown = buckets
    .map((b, i) => ({
      ...b,
      share: (b.count / total) * 100,
      opacity: BAND_OPACITY[i] ?? 1,
    }))
    .filter((b) => b.count > 0);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader>
        <CardTitle>Profit distribution</CardTitle>
      </CardHeader>

      <CardContent>
        {/* Reference balance-card headline: the count with the profitable
            share beside it in profit ink. */}
        <div className="flex items-end gap-2.5">
          <span className="text-metric text-ink">{total}</span>
          <span className="pb-0.5 text-label font-semibold text-profit">
            {Math.round((wins / total) * 100)}% profitable
          </span>
          <span className="pb-0.5 text-label text-ink-muted">
            closed trades
          </span>
        </div>

        <div className="mt-5 mb-6 border-b border-line" />

        {/* Split bar — one segment per band, sized by its share of trades.
            Tiny bands keep a visible sliver; the printed % stays exact.
            Hovering a segment raises the equity curve's tooltip card with
            the band's full figures and dims the rest. */}
        <div
          ref={barRef}
          className="relative flex w-full items-start gap-1.5"
          onMouseMove={onMove}
          onMouseLeave={() => {
            setHovered(null);
            setHoverPx(null);
          }}
        >
          {shown.map((b) => {
            const dimmed = hovered !== null && hovered !== b.label;
            return (
              <div
                key={b.label}
                tabIndex={0}
                onMouseEnter={() => setHovered(b.label)}
                onFocus={() => setHovered(b.label)}
                onBlur={() => setHovered(null)}
                aria-label={`${b.label}: ${b.count} trades, ${Math.round(b.share)} percent, net ${money(Math.round(b.pnl), { signed: true })}`}
                className={cn(
                  "min-w-0 cursor-pointer space-y-2.5 rounded-xs outline-none",
                  "transition-opacity duration-150 ease-out",
                  "focus-visible:ring-2 focus-visible:ring-accent",
                  dimmed && "opacity-40",
                )}
                style={{ width: `${Math.max(b.share, 6)}%` }}
              >
                <div
                  className={cn(
                    "h-2.5 w-full rounded-sm",
                    b.sign === "win" ? "bg-profit" : "bg-loss",
                  )}
                  style={{ opacity: b.opacity }}
                />
                <div className="flex flex-col items-start">
                  <span className="text-[11px] font-medium tnum whitespace-nowrap text-ink-muted">
                    {b.label}
                  </span>
                  <span className="text-body font-semibold tnum text-ink">
                    {Math.round(b.share)}%
                  </span>
                </div>
              </div>
            );
          })}

          {hovered && hoverPx && (() => {
            const b = shown.find((x) => x.label === hovered);
            if (!b) return null;
            return (
              <TooltipBox
                containerHeight={hoverPx.h}
                containerRef={barRef}
                containerWidth={hoverPx.w}
                offset={12}
                visible
                x={hoverPx.x}
                y={hoverPx.y}
              >
                <TooltipContent
                  title={`${b.label} band`}
                  rows={[
                    {
                      color: `var(--color-${b.sign === "win" ? "profit" : "loss"})`,
                      label: "Trades",
                      value: b.count,
                    },
                    {
                      color: "var(--color-ink-muted)",
                      label: "Share",
                      value: `${b.share.toFixed(1)}%`,
                    },
                    {
                      color: `var(--color-${b.pnl >= 0 ? "profit" : "loss"})`,
                      label: "Net P&L",
                      value: money(Math.round(b.pnl), { signed: true }),
                    },
                  ]}
                />
              </TooltipBox>
            );
          })()}
        </div>

        <p className="mt-4 text-[11.5px] text-ink-muted">
          Bands are trade P&amp;L in dollars, scaled to account size · share of
          all closed trades.
        </p>
      </CardContent>
    </Card>
  );
}
