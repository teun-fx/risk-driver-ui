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

function Key({ tone, label }: { tone: "profit" | "loss"; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-2.5 w-2 rounded-xs"
        style={{ background: `var(--color-${tone})`, opacity: 0.85 }}
        aria-hidden
      />
      <span className="text-label text-ink-secondary">{label}</span>
    </span>
  );
}

/**
 * The full ledger, with the win/loss sequence strip folded in above it —
 * the strip is the same trades the table lists, so they share one card.
 * Every recent trade is one block, in order; clustering is the point:
 * losses bunching together is what tilt and regime change look like.
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

      {/* Win/loss sequence — flat monthly-returns inks, oldest to newest. */}
      <div className="border-b border-line px-5 py-4">
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
                background: `var(--color-${win ? "profit" : "loss"})`,
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4">
          <Key tone="profit" label="Win" />
          <Key tone="loss" label="Loss" />
          <span className="text-label text-ink-muted">
            Oldest on the left, most recent on the right
          </span>
          {trades.length > SHOWN && (
            <span className="ml-auto text-label text-ink-muted">
              Table shows latest {SHOWN}
            </span>
          )}
        </div>
      </div>

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
