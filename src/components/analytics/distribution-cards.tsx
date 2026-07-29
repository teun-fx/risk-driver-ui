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
const SEGMENTS = 12;

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
        {/* Histogram of segment stacks — the accounts-page return meter
            stood upright: pills fill from the baseline in proportion to the
            largest band, profit green for winning bands, loss red for losing
            ones, hollow bordered slots for the rest. */}
        <div className="flex items-end justify-between gap-3 pt-2">
          {buckets.map((b, i) => {
            const lit = b.count
              ? Math.max(1, Math.round((b.count / max) * SEGMENTS))
              : 0;
            return (
              <div
                key={b.label}
                className="flex min-w-0 flex-1 flex-col items-center gap-2"
              >
                <span className="text-[11.5px] tnum text-ink-secondary">
                  {b.count}
                </span>
                <div className="flex w-full max-w-9 flex-col-reverse gap-1" aria-hidden>
                  {Array.from({ length: SEGMENTS }, (_, j) => (
                    <span
                      key={j}
                      className={cn(
                        "block-pop h-2 w-full rounded-full",
                        j < lit
                          ? b.sign === "win"
                            ? "bg-profit"
                            : "bg-loss"
                          : "border border-line bg-raised",
                      )}
                      style={
                        j < lit
                          ? { opacity: 0.85, animationDelay: `${i * 40 + j * 18}ms` }
                          : { animationDelay: `${i * 40 + j * 18}ms` }
                      }
                    />
                  ))}
                </div>
                <span className="text-[11px] tnum whitespace-nowrap text-ink-muted">
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11.5px] text-ink-muted">
          Bands are trade P&amp;L in dollars, scaled to account size.
        </p>
      </CardContent>
    </Card>
  );
}
