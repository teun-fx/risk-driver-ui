"use client";

import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MenuSelect } from "@/components/ui/select";
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

const signedPct = (v: number, dp = 1) =>
  `${sign(v)}${Math.abs(v).toFixed(dp)}%`;

/* Bars rise from the baseline, staggered — the reference activity chart. */
const chartVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const barVariants = {
  hidden: { scaleY: 0, opacity: 0 },
  visible: {
    scaleY: 1,
    opacity: 1,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
  },
};

/**
 * "When do I make money?" in the reference activity-card layout: the headline
 * return sits on the left, a bar per period fills the rest. Bars are plain
 * ink like the reference — magnitude is the bar's job, and the sign is read
 * from the headline and the hover figures, which keep the P&L inks.
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
  const totalPct = (totalPnl / data.base) * 100;
  const up = totalPnl >= 0;
  const maxPct = Math.max(
    ...rows.map((d) => Math.abs((d.pnl / data.base) * 100)),
    0.001,
  );

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Performance</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            Win rate and return by {view.toLowerCase()}
          </p>
        </div>
        <MenuSelect
          options={VIEWS}
          value={view}
          onChange={setView}
          ariaLabel="Breakdown period"
        />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-center pt-0">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          {/* Headline return — the reference's big total, on the left. */}
          <div className="flex shrink-0 flex-col">
            <p
              className={cn(
                "text-[42px] leading-none font-semibold tracking-tight tnum",
                up ? "text-ink" : "text-loss",
              )}
            >
              {signedPct(totalPct)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-label text-ink-muted">
              {up ? (
                <TrendingUp className="size-4 shrink-0 text-profit" aria-hidden />
              ) : (
                <TrendingDown className="size-4 shrink-0 text-loss" aria-hidden />
              )}
              {money(Math.round(totalPnl), { signed: true })} · {winRate}% win
              rate
            </p>
          </div>

          {/* Bars re-run their entrance when the period changes. */}
          <motion.div
            key={view}
            variants={chartVariants}
            initial="hidden"
            animate="visible"
            className="flex h-28 w-full items-end justify-between gap-2"
            role="img"
            aria-label={`Return by ${view.toLowerCase()}: ${rows
              .map(
                (d) =>
                  `${LONG_LABEL[d.label] ?? d.label} ${signedPct((d.pnl / data.base) * 100)}`,
              )
              .join(", ")}`}
          >
            {rows.map((d) => {
              const pct = (d.pnl / data.base) * 100;
              const pos = d.pnl >= 0;
              const rate = d.trades ? Math.round((d.wins / d.trades) * 100) : 0;
              // Floor at 6% so a flat period still reads as a bar, not a gap.
              const height = Math.max(6, (Math.abs(pct) / maxPct) * 100);
              return (
                <div
                  key={d.label}
                  tabIndex={0}
                  className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <motion.span
                    variants={barVariants}
                    style={{ height: `${height}%`, transformOrigin: "bottom" }}
                    className={cn(
                      "w-full max-w-9 rounded-md bg-ink",
                      "transition-opacity duration-150 ease-out group-hover:opacity-80",
                    )}
                  />
                  <span className="text-[11px] text-ink-muted">{d.label}</span>

                  {/* Hover figures — same surface as the chart tooltips. */}
                  <span
                    role="tooltip"
                    className={cn(
                      "pointer-events-none invisible absolute bottom-[calc(100%-14px)] left-1/2 z-30 w-44 -translate-x-1/2",
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
                        v={signedPct(pct, 2)}
                        tone={pos ? "profit" : "loss"}
                      />
                      <Row k="Trades" v={`${d.trades}`} />
                      <Row k="Win rate" v={`${rate}%`} />
                    </span>
                  </span>
                </div>
              );
            })}
          </motion.div>
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
