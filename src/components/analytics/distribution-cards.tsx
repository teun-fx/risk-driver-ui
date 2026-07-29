"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { profitDistribution, type Account } from "@/lib/data";
import { cn } from "@/lib/utils";

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
            Tiny bands keep a visible sliver; the printed % stays exact. */}
        <div className="flex w-full items-start gap-1.5">
          {shown.map((b) => (
            <div
              key={b.label}
              className="min-w-0 space-y-2.5"
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
          ))}
        </div>

        <p className="mt-4 text-[11.5px] text-ink-muted">
          Bands are trade P&amp;L in dollars, scaled to account size · share of
          all closed trades.
        </p>
      </CardContent>
    </Card>
  );
}
