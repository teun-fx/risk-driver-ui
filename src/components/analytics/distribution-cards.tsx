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
const SEGMENTS = 90;

export function ProfitDistribution({ account }: { account: Account }) {
  const buckets = useMemo(() => profitDistribution(account), [account]);
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((a, b) => a + b.count, 0) || 1;
  const wins = buckets
    .filter((b) => b.sign === "win")
    .reduce((a, b) => a + b.count, 0);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Profit distribution</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-metric text-ink">{total}</span>
            <span className="text-label text-ink-muted">
              closed trades · {Math.round((wins / total) * 100)}% profitable
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* The accounts-page return meter, row per band: upright pills
            running left to right, lit in proportion to the largest band.
            Wins in the meter's profit green, losses in its red, the rest
            hollow bordered slots. */}
        <ul className="space-y-2.5">
          {buckets.map((b, i) => {
            const lit = b.count
              ? Math.max(1, Math.round((b.count / max) * SEGMENTS))
              : 0;
            return (
              <li key={b.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-right text-[11.5px] tnum text-ink-muted">
                  {b.label}
                </span>

                <span
                  className="flex min-w-0 flex-1 [&>span]:max-w-[6px] gap-1"
                  aria-hidden
                >
                  {Array.from({ length: SEGMENTS }, (_, j) => (
                    <span
                      key={j}
                      className={cn(
                        "block-pop h-5 min-w-0 flex-1 rounded-full",
                        j < lit
                          ? b.sign === "win"
                            ? "bg-profit"
                            : "bg-loss"
                          : "border border-line bg-raised",
                      )}
                      style={
                        j < lit
                          ? { opacity: 0.85, animationDelay: `${i * 40 + j * 4}ms` }
                          : { animationDelay: `${i * 40 + j * 4}ms` }
                      }
                    />
                  ))}
                </span>

                <span className="w-7 shrink-0 text-right text-[11.5px] tnum text-ink-secondary">
                  {b.count}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-[11.5px] text-ink-muted">
          Bands are trade P&amp;L in dollars, scaled to account size.
        </p>
      </CardContent>
    </Card>
  );
}
