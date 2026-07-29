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

/** What the headline names when nothing is hovered. */
const ALL_LABEL: Record<View, string> = {
  Day: "All days",
  Month: "All months",
  Year: "All years",
};

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
  const [hovered, setHovered] = useState<string | null>(null);

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
  // A label from the previous view would never match the new rows.
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setHovered(null);
  }

  const totalPnl = rows.reduce((a, d) => a + d.pnl, 0);
  const totalTrades = rows.reduce((a, d) => a + d.trades, 0) || 1;
  const totalWins = rows.reduce((a, d) => a + d.wins, 0);
  // Headline follows the pointer: the hovered period, or every period at rest.
  const active = hovered ? rows.find((d) => d.label === hovered) : undefined;
  const headPnl = active ? active.pnl : totalPnl;
  const headPct = (headPnl / data.base) * 100;
  const headTrades = active ? active.trades : totalTrades;
  const headWins = active ? active.wins : totalWins;
  const headRate = headTrades ? Math.round((headWins / headTrades) * 100) : 0;
  const headLabel = active
    ? (LONG_LABEL[active.label] ?? active.label)
    : ALL_LABEL[view];
  const up = headPnl >= 0;
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
            <p className="text-label text-ink-muted">{headLabel}</p>
            <p
              className={cn(
                "mt-1 text-[42px] leading-none font-semibold tracking-tight tnum",
                up ? "text-ink" : "text-loss",
              )}
            >
              {signedPct(headPct)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-label text-ink-muted">
              {up ? (
                <TrendingUp className="size-4 shrink-0 text-profit" aria-hidden />
              ) : (
                <TrendingDown className="size-4 shrink-0 text-loss" aria-hidden />
              )}
              {money(Math.round(headPnl), { signed: true })} · {headRate}% win
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
              const rate = d.trades ? Math.round((d.wins / d.trades) * 100) : 0;
              // Floor at 6% so a flat period still reads as a bar, not a gap.
              const height = Math.max(6, (Math.abs(pct) / maxPct) * 100);
              return (
                <div
                  key={d.label}
                  tabIndex={0}
                  onMouseEnter={() => setHovered(d.label)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(d.label)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${LONG_LABEL[d.label] ?? d.label}: ${signedPct(pct, 2)}, ${rate}% win rate over ${d.trades} trades`}
                  className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <motion.span
                    variants={barVariants}
                    style={{ height: `${height}%`, transformOrigin: "bottom" }}
                    className={cn(
                      "w-full max-w-9 rounded-md bg-ink",
                      "transition-opacity duration-150 ease-out",
                      hovered && hovered !== d.label ? "opacity-30" : "opacity-100",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[11px] transition-colors duration-150 ease-out",
                      hovered === d.label ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {d.label}
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
