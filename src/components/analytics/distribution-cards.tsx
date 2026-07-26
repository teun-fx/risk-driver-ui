"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { profitDistribution, type Account } from "@/lib/data";

/**
 * Histogram of closed-trade outcomes. Bars are horizontal because the bucket
 * labels are text; fills use the same flat profit/loss ink as the monthly
 * returns table (solid colour at 85%, no gradient) so the two read as one
 * family.
 */
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
        <ul className="space-y-1.5">
          {buckets.map((b, i) => (
            <li key={b.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-right text-[11.5px] tnum text-ink-muted">
                {b.label}
              </span>

              <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-xs bg-raised">
                <span
                  className="bar-grow absolute inset-y-0 left-0 rounded-xs"
                  style={{
                    width: `${(b.count / max) * 100}%`,
                    animationDelay: `${i * 45}ms`,
                    background: `var(--color-${b.sign === "win" ? "profit" : "loss"})`,
                    opacity: 0.85,
                  }}
                />
              </span>

              <span className="w-7 shrink-0 text-right text-[11.5px] tnum text-ink-secondary">
                {b.count}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[11.5px] text-ink-muted">
          Bands are trade P&amp;L in dollars, scaled to account size.
        </p>
      </CardContent>
    </Card>
  );
}
