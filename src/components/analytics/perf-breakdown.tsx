"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/input";
import { byMonth, byWeekday, byYear, type Account, type Breakdown } from "@/lib/data";
import { cn, money } from "@/lib/utils";

const VIEWS = ["Day", "Month", "Year"] as const;
type View = (typeof VIEWS)[number];

const LONG_LABEL: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

/**
 * "When do I make money?" — the reference's holdings-list read: the P&L is
 * the headline of each row, the period sits beneath it, and the right column
 * carries that period's share of all trades. Colour follows the SIGN of the
 * P&L, never its rank, so a weakest-but-profitable Monday still reads green.
 */
export function PerfBreakdown({ account }: { account: Account }) {
  const [view, setView] = useState<View>("Day");

  const rows: Breakdown[] = useMemo(() => {
    const data =
      view === "Day"
        ? byWeekday(account)
        : view === "Month"
          ? byMonth(account)
          : byYear(account);
    return data.filter((d) => d.trades > 0);
  }, [view, account]);

  const totalTrades = rows.reduce((a, d) => a + d.trades, 0) || 1;
  const best = rows.reduce((a, b) => (b.pnl > a.pnl ? b : a), rows[0]);
  const worst = rows.reduce((a, b) => (b.pnl < a.pnl ? b : a), rows[0]);

  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Performance by {view.toLowerCase()}</CardTitle>
          {best && worst && (
            <p className="mt-0.5 text-label text-ink-muted">
              Best{" "}
              <span
                className={cn(
                  "font-medium",
                  best.pnl >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {best.label}
              </span>{" "}
              · Weakest{" "}
              <span
                className={cn(
                  "font-medium",
                  worst.pnl >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {worst.label}
              </span>
            </p>
          )}
        </div>
        <SegmentedControl
          options={VIEWS}
          value={view}
          onChange={setView}
          ariaLabel="Breakdown period"
        />
      </CardHeader>

      <CardContent>
        <div
          className={cn(
            "grid grid-cols-1 gap-x-10",
            // Twelve months read better split into two columns on wide screens.
            rows.length > 7 && "lg:grid-cols-2",
          )}
        >
          <ul className="contents">
            {rows.map((d) => {
              const up = d.pnl >= 0;
              return (
                <li
                  key={d.label}
                  className="flex items-center gap-4 border-b border-line py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-body font-semibold tnum",
                        up ? "text-profit" : "text-loss",
                      )}
                    >
                      {money(d.pnl, { signed: true })}
                    </p>
                    <p className="mt-0.5 text-label text-ink-muted">
                      {LONG_LABEL[d.label] ?? d.label} · {d.trades} trades
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-body font-semibold tnum text-ink">
                    {Math.round((d.trades / totalTrades) * 100)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-3 text-[11.5px] text-ink-muted">
          Right column is each period&apos;s share of all trades.
        </p>
      </CardContent>
    </Card>
  );
}
