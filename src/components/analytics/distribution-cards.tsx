"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { profitDistribution, winLossSequence, type Account } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Histogram of closed-trade outcomes. Bars are horizontal because the bucket
 * labels are text; fills sit at the same calm weight as the app's meters
 * (soft top-light gradient, 72% opacity — no glow, no full-strength shout).
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
                    background: `linear-gradient(180deg, color-mix(in oklab, var(--color-${b.sign === "win" ? "profit" : "loss"}) 82%, white), var(--color-${b.sign === "win" ? "profit" : "loss"}))`,
                    opacity: 0.72,
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

/**
 * Every recent trade as one block, in order — clustering is the point:
 * losses bunching together is what tilt and regime change look like.
 */
export function WinLossSequence({ account }: { account: Account }) {
  const seq = useMemo(() => winLossSequence(account), [account]);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Win / loss sequence</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-metric text-ink">
              {Math.round((seq.wins / seq.total) * 100)}%
            </span>
            <span className="text-label text-ink-muted">
              win rate over last {seq.total} trades
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <Stat label="Longest win run" value={seq.longestWin} tone="profit" />
          <Stat label="Longest loss run" value={seq.longestLoss} tone="loss" />
          <Stat
            label="Current streak"
            value={seq.currentStreak}
            tone={seq.currentIsWin ? "profit" : "loss"}
            suffix={seq.currentIsWin ? "W" : "L"}
          />
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <div
          className="flex flex-wrap content-start gap-[3px]"
          role="img"
          aria-label={`Sequence of ${seq.total} trades, ${seq.wins} wins`}
        >
          {seq.results.map((win, i) => (
            <span
              key={i}
              title={`Trade ${i + 1}: ${win ? "win" : "loss"}`}
              className="block-pop h-6 w-2 rounded-xs transition-transform duration-150 ease-out hover:scale-y-125"
              style={{
                animationDelay: `${Math.min(i * 9, 900)}ms`,
                background: `linear-gradient(180deg, color-mix(in oklab, var(--color-${win ? "profit" : "loss"}) 82%, white), var(--color-${win ? "profit" : "loss"}))`,
                opacity: 0.72,
              }}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Key tone="profit" label="Win" />
          <Key tone="loss" label="Loss" />
          <span className="text-label text-ink-muted">
            Oldest on the left, most recent on the right
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  tone: "profit" | "loss";
  suffix?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-[11px] whitespace-nowrap text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-body font-semibold tnum",
          tone === "profit" ? "text-profit" : "text-loss",
        )}
      >
        {value}
        {suffix}
      </p>
    </div>
  );
}

function Key({ tone, label }: { tone: "profit" | "loss"; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-2.5 w-2 rounded-xs"
        style={{ background: `var(--color-${tone})`, opacity: 0.72 }}
        aria-hidden
      />
      <span className="text-label text-ink-secondary">{label}</span>
    </span>
  );
}
