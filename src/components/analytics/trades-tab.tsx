"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { PositionsTable } from "@/components/dashboard/positions-table";
import { ProfitDistribution } from "@/components/analytics/distribution-cards";
import { tradeHistoryFor, winLossSequence, type Account } from "@/lib/data";
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

/** Open time derived from the close and the held duration. */
function openDate(t: { date: Date; durationHours: number }): Date {
  return new Date(t.date.getTime() - t.durationHours * 3_600_000);
}

/**
 * The full ledger — compact factsheet rows: opened, closed, instrument,
 * side, held, P&L. Streak stats live in the header.
 */
function ClosedTradesTable({ account }: { account: Account }) {
  const trades = useMemo(
    () =>
      [...tradeHistoryFor(account)].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      ),
    [account],
  );
  const seq = useMemo(() => winLossSequence(account), [account]);
  const shown = trades.slice(0, SHOWN);
  const net = trades.reduce((a, t) => a + t.pnl, 0);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader bordered className="items-center">
        <div>
          <CardTitle>Closed trades</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            {trades.length.toLocaleString("en-US")} trades ·{" "}
            {money(Math.round(net), { signed: true })} net ·{" "}
            {Math.round((seq.wins / seq.total) * 100)}% win rate over last{" "}
            {seq.total}
          </p>
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

      <Table>
        <caption className="sr-only">
          Closed trades with open and close date, instrument, side, holding
          time and realized profit or loss
        </caption>
        <THead>
          <tr>
            <TH>Opened</TH>
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
                <TD className="py-2 text-ink-secondary">
                  {fullDate(openDate(t))}
                </TD>
                <TD className="py-2 text-ink">{fullDate(t.date)}</TD>
                <TD className="py-2">
                  <span className="font-medium tnum text-ink">{t.pair}</span>
                </TD>
                <TD className="py-2">
                  <Badge tone={t.side === "Long" ? "accent" : "neutral"}>
                    {t.side}
                  </Badge>
                </TD>
                <TD numeric className="py-2">
                  {duration(t.durationHours)}
                </TD>
                <TD numeric className="py-2">
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
      {trades.length > SHOWN && (
        <p className="border-t border-line px-5 py-2.5 text-label text-ink-muted">
          Showing latest {SHOWN} of {trades.length.toLocaleString("en-US")}
        </p>
      )}
    </Card>
  );
}

export function TradesTab({ account }: { account: Account }) {
  return (
    <>
      <section aria-label="Open positions">
        <PositionsTable account={account} />
      </section>

      {/* Shape of the same trades the ledger below lists. */}
      <section aria-label="Profit distribution">
        <ProfitDistribution account={account} />
      </section>

      <section aria-label="Closed trades and sequence">
        <ClosedTradesTable account={account} />
      </section>
    </>
  );
}
