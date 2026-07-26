"use client";

import { useMemo, useState } from "react";
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
 * The full ledger. The win/loss sequence lives in the table itself: each row
 * carries a vertical bar in the trailing column, green or red by sign and
 * scaled by size of the move, so clustering — losses bunching together, which
 * is what tilt and regime change look like — reads straight down the column.
 * Hovering a row crossfades its bar to full strength and drops the rest back.
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
  const [hover, setHover] = useState<number | null>(null);
  const shown = trades.slice(0, SHOWN);
  const net = trades.reduce((a, t) => a + t.pnl, 0);
  const maxAbs = Math.max(...shown.map((t) => Math.abs(t.pnl)), 1);

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

      <div className="flex items-center gap-4 border-b border-line px-5 py-3">
        <Key tone="profit" label="Win" />
        <Key tone="loss" label="Loss" />
        <span className="text-label text-ink-muted">
          Bar length scales with size of the move
        </span>
        {trades.length > SHOWN && (
          <span className="ml-auto text-label text-ink-muted">
            Showing latest {SHOWN}
          </span>
        )}
      </div>

      <Table>
        <caption className="sr-only">
          Closed trades with date, instrument, side, holding time, realized
          profit or loss, and a win/loss bar scaled to the size of the move
        </caption>
        <THead>
          <tr>
            <TH>Closed</TH>
            <TH>Instrument</TH>
            <TH>Side</TH>
            <TH numeric>Held</TH>
            <TH numeric>P&amp;L</TH>
            <TH className="w-10 text-center">Seq</TH>
          </tr>
        </THead>
        <tbody onMouseLeave={() => setHover(null)}>
          {shown.map((t) => {
            const win = t.pnl >= 0;
            const h = Math.max(20, (Math.abs(t.pnl) / maxAbs) * 100);
            const dimmed = hover !== null && hover !== t.id;
            return (
              <TR key={t.id} onMouseEnter={() => setHover(t.id)}>
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

                {/* Sequence bar — vertical, flat monthly-returns ink. */}
                <TD className="px-2">
                  <span
                    className="flex h-6 items-center justify-center"
                    title={`${win ? "Win" : "Loss"} · ${money(t.pnl, { signed: true })}`}
                  >
                    <span
                      className={cn(
                        "block w-2 rounded-xs transition-opacity duration-150 ease-out",
                        win ? "bg-profit" : "bg-loss",
                      )}
                      style={{
                        height: `${h}%`,
                        opacity: dimmed ? 0.25 : hover === t.id ? 1 : 0.85,
                      }}
                    />
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
