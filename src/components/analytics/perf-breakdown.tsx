"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** How far a panel at each stack depth is lifted, and how it layers. */
const DEPTH: Record<number, string> = {
  0: "z-30 translate-y-0",
  1: "z-20 -translate-y-[42px]",
  2: "z-10 -translate-y-[84px]",
};

/**
 * "When do I make money?" as a stacked deck of period cards — Day, Month and
 * Year are three cards on one pile; the back cards peek out above the front
 * one and clicking a peeking title brings that card forward. Each period is
 * a monthly-returns-style cell: win rate and return as plain coloured text
 * with a thin magnitude bar — flat profit/loss ink, no gradients. Colour
 * follows the SIGN of each period's return, never its rank.
 */
export function PerfBreakdown({ account }: { account: Account }) {
  // Front-to-back stacking order; order[0] is the active view.
  const [order, setOrder] = useState<View[]>(["Day", "Month", "Year"]);
  const view = order[0];

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

  const raise = (v: View) =>
    setOrder((o) => [v, ...o.filter((x) => x !== v)]);

  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Performance</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            Win rate and return by {view.toLowerCase()}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {/* Headline + delta chip for the active card. */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn("text-metric tnum", up ? "text-ink" : "text-loss")}
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

        {/* The deck. Back cards peek out above the front one by their title
            bar; pt makes room for the two peeking strips. */}
        <div className="mt-4 grid pt-[84px] [grid-template-areas:'stack']">
          {VIEWS.map((v) => {
            const depth = order.indexOf(v);
            const front = depth === 0;
            const panelRows = data.all[v];
            const pnl = panelRows.reduce((a, d) => a + d.pnl, 0);
            return (
              <div
                key={v}
                className={cn(
                  "[grid-area:stack] rounded-lg border border-line bg-surface",
                  "transition-transform duration-300 ease-out",
                  DEPTH[depth],
                  front ? "shadow-pop" : "hover:-translate-y-[calc(var(--lift)+4px)]",
                )}
                style={
                  front
                    ? undefined
                    : ({ "--lift": `${depth * 42}px` } as React.CSSProperties)
                }
              >
                {front ? (
                  <div className="flex h-10 items-center justify-between px-4">
                    <span className="text-label font-medium text-ink">
                      By {v.toLowerCase()}
                    </span>
                    <span
                      className={cn(
                        "text-label tnum font-medium",
                        pnl >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {money(Math.round(pnl), { signed: true })}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => raise(v)}
                    className={cn(
                      "flex h-10 w-full cursor-pointer items-center justify-between rounded-t-lg px-4 outline-none",
                      "text-label text-ink-muted transition-colors duration-150 ease-out",
                      "hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
                    )}
                    aria-label={`Show performance by ${v.toLowerCase()}`}
                  >
                    <span className="font-medium">By {v.toLowerCase()}</span>
                    <span
                      className={cn(
                        "tnum font-medium",
                        pnl >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {money(Math.round(pnl), { signed: true })}
                    </span>
                  </button>
                )}

                <PanelCells
                  rows={panelRows}
                  base={data.base}
                  interactive={front}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** The monthly-returns cell grid for one period breakdown. */
function PanelCells({
  rows,
  base,
  interactive,
}: {
  rows: Breakdown[];
  base: number;
  interactive: boolean;
}) {
  const maxPct = Math.max(
    ...rows.map((d) => Math.abs((d.pnl / base) * 100)),
    0.001,
  );
  return (
    <div className="flex flex-wrap gap-y-2 border-t border-grid px-2 pt-2 pb-3">
      {rows.map((d) => {
        const pct = (d.pnl / base) * 100;
        const pos = d.pnl >= 0;
        const rate = d.trades ? Math.round((d.wins / d.trades) * 100) : 0;
        const width = Math.max(8, (Math.abs(pct) / maxPct) * 100);
        return (
          <div
            key={d.label}
            tabIndex={interactive ? 0 : -1}
            className={cn(
              "group relative flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xs py-1.5 outline-none",
              interactive && "focus-visible:ring-2 focus-visible:ring-accent",
            )}
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

            {/* Magnitude — the risk-budget pill stack, vertical, filled by size of move. */}
            <VerticalSegmentMeter
              value={width}
              tone={pos ? "profit" : "loss"}
              label={`${LONG_LABEL[d.label] ?? d.label} magnitude`}
            />

            <span className="text-[11px] tnum text-ink-secondary">
              {rate}% win
            </span>

            {/* Hover stats — same tooltip surface as the charts. */}
            {interactive && (
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
            )}
          </div>
        );
      })}
    </div>
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
