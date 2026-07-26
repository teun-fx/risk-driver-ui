"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/input";
import { VerticalSegmentMeter } from "@/components/ui/progress";
import {
  byMonth,
  byWeekday,
  byYear,
  tradeHistoryFor,
  type Account,
  type Breakdown,
} from "@/lib/data";
import { cn, money } from "@/lib/utils";

const VIEWS = ["Day", "Month", "Year"] as const;
type View = (typeof VIEWS)[number];

const LONG_LABEL: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

function sign(v: number) {
  return v > 0 ? "+" : v < 0 ? "−" : "";
}

/**
 * "When do I make money?" — compact. The period picker is the same segmented
 * control as the equity curve's range selector; each period is a
 * monthly-returns-style cell (win rate + return, flat profit/loss ink) with
 * the vertical risk-budget pill meter carrying magnitude. Colour follows the
 * SIGN of each period's return, never its rank.
 */
export function PerfBreakdown({ account }: { account: Account }) {
  const [view, setView] = useState<View>("Day");

  const data = useMemo(() => {
    const all: Record<View, Breakdown[]> = {
      Day: byWeekday(account).filter((d) => d.trades > 0),
      Month: byMonth(account).filter((d) => d.trades > 0),
      Year: byYear(account).filter((d) => d.trades > 0),
    };
    // Return base: balance before the first trade, so period P&L reads as %.
    const allPnl = tradeHistoryFor(account).reduce((a, t) => a + t.pnl, 0);
    const base =
      account.startingBalance && account.startingBalance > 0
        ? account.startingBalance
        : Math.max(account.equity - allPnl, 1);
    return { all, base };
  }, [account]);

  const rows = data.all[view];
  const totalPnl = rows.reduce((a, d) => a + d.pnl, 0);
  const totalTrades = rows.reduce((a, d) => a + d.trades, 0) || 1;
  const totalWins = rows.reduce((a, d) => a + d.wins, 0);
  const winRate = Math.round((totalWins / totalTrades) * 100);
  const up = totalPnl >= 0;
  const maxPct = Math.max(
    ...rows.map((d) => Math.abs((d.pnl / data.base) * 100)),
    0.001,
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Performance</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            Win rate and return by {view.toLowerCase()}
          </p>
        </div>
        <SegmentedControl
          options={VIEWS}
          value={view}
          onChange={setView}
          ariaLabel="Breakdown period"
        />
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn("text-title tnum", up ? "text-ink" : "text-loss")}
          >
            {money(Math.round(totalPnl), { signed: true })}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-label font-medium",
              up ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss",
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden />
            )}
            {winRate}% win rate
          </span>
        </div>

        {/* Cells cross over on view change — quick fade, no re-entrance drama. */}
        <div key={view} className="fade-rise mt-3 flex flex-wrap gap-y-1">
          {rows.map((d) => {
            const pct = (d.pnl / data.base) * 100;
            const pos = d.pnl >= 0;
            const rate = d.trades ? Math.round((d.wins / d.trades) * 100) : 0;
            const width = Math.max(8, (Math.abs(pct) / maxPct) * 100);
            return (
              <div
                key={d.label}
                tabIndex={0}
                className="group relative flex min-w-[56px] flex-1 flex-col items-center gap-1 rounded-xs py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-[11px] text-ink-muted">{d.label}</span>

                <span
                  className={cn(
                    "text-[11.5px] tnum",
                    pos ? "text-profit" : "text-loss",
                  )}
                >
                  {sign(pct)}
                  {Math.abs(pct).toFixed(1)}%
                </span>

                {/* Magnitude — the risk-budget pill stack, vertical. */}
                <VerticalSegmentMeter
                  value={width}
                  segments={5}
                  tone={pos ? "profit" : "loss"}
                  label={`${LONG_LABEL[d.label] ?? d.label} magnitude`}
                />

                <span className="text-[11px] tnum text-ink-secondary">
                  {rate}% win
                </span>

                {/* Hover stats — same tooltip surface as the charts. */}
                <span
                  role="tooltip"
                  className={cn(
                    "pointer-events-none invisible absolute bottom-[calc(100%+4px)] left-1/2 z-30 w-44 -translate-x-1/2",
                    "rounded-md border border-line bg-overlay px-3 py-2.5 text-left shadow-pop",
                    "opacity-0 transition-opacity duration-150 ease-out",
                    "group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100",
                  )}
                >
                  <span className="block text-label text-ink-muted">
                    {LONG_LABEL[d.label] ?? d.label}
                  </span>
                  <span className="mt-1.5 block space-y-1">
                    <Row
                      k="Net P&L"
                      v={money(d.pnl, { signed: true })}
                      tone={pos ? "profit" : "loss"}
                    />
                    <Row
                      k="Return"
                      v={`${sign(pct)}${Math.abs(pct).toFixed(2)}%`}
                      tone={pos ? "profit" : "loss"}
                    />
                    <Row k="Trades" v={`${d.trades}`} />
                    <Row k="Win rate" v={`${rate}%`} />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "profit" | "loss";
}) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-label text-ink-secondary">{k}</span>
      <span
        className={cn(
          "text-label tnum font-medium",
          tone === "profit"
            ? "text-profit"
            : tone === "loss"
              ? "text-loss"
              : "text-ink",
        )}
      >
        {v}
      </span>
    </span>
  );
}
