"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { PositionsTable } from "@/components/dashboard/positions-table";
import {
  ProfitDistribution,
  WinLossSequence,
} from "@/components/analytics/distribution-cards";
import { tradeHistoryFor, type Account } from "@/lib/data";
import { cn, money } from "@/lib/utils";

const SHOWN = 30;

function fullDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function duration(hours: number) {
  if (!hours) return "—";
  return hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`;
}

/** Every closed trade, newest first — the full ledger behind the summaries. */
function ClosedTradesTable({ account }: { account: Account }) {
  const trades = useMemo(
    () =>
      [...tradeHistoryFor(account)].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      ),
    [account],
  );
  const shown = trades.slice(0, SHOWN);
  const net = trades.reduce((a, t) => a + t.pnl, 0);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader bordered>
        <div>
          <CardTitle>Closed trades</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            {trades.length.toLocaleString("en-US")} trades ·{" "}
            {money(Math.round(net), { signed: true })} net
          </p>
        </div>
        {trades.length > SHOWN && (
          <span className="text-label text-ink-muted">
            Showing latest {SHOWN}
          </span>
        )}
      </CardHeader>

      <Table>
        <caption className="sr-only">
          Closed trades with date, instrument, side, holding time and realized
          profit or loss
        </caption>
        <THead>
          <tr>
            <TH>Closed</TH>
            <TH>Instrument</TH>
            <TH>Side</TH>
            <TH numeric>Held</TH>
            <TH numeric>P&amp;L</TH>
          </tr>
        </THead>
        <tbody>
          {shown.map((t) => {
            const win = t.pnl >= 0;
            return (
              <TR key={t.id}>
                <TD className="text-ink">{fullDate(t.date)}</TD>
                <TD>
                  <span className="font-medium tnum text-ink">{t.pair}</span>
                </TD>
                <TD>
                  <Badge tone={t.side === "Long" ? "accent" : "neutral"}>
                    {t.side}
                  </Badge>
                </TD>
                <TD numeric>{duration(t.durationHours)}</TD>
                <TD numeric>
                  <span
                    className={cn(
                      "font-medium",
                      win ? "text-profit" : "text-loss",
                    )}
                  >
                    {money(t.pnl, { signed: true })}
                  </span>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

export function TradesTab({ account }: { account: Account }) {
  return (
    <>
      <section aria-label="Open positions">
        <PositionsTable account={account} />
      </section>

      {/* Shape and order of the same trades the ledger below lists. */}
      <section
        aria-label="Distribution and sequence"
        className="grid grid-cols-1 gap-5 xl:grid-cols-2"
      >
        <ProfitDistribution account={account} />
        <WinLossSequence account={account} />
      </section>

      <section aria-label="Closed trades">
        <ClosedTradesTable account={account} />
      </section>
    </>
  );
}
