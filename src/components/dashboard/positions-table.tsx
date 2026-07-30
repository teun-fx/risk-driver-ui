import { ArrowUpRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { notionalFor, positionsFor, type Account } from "@/lib/data";
import { cn, money, pct, price } from "@/lib/utils";

const riskTone = {
  Low: "profit",
  Elevated: "info",
  High: "loss",
} as const;

export function PositionsTable({ account }: { account: Account }) {
  // A closed-trade statement has no open positions.
  if (account.source === "html") {
    return (
      <Card className="min-w-0 overflow-hidden">
        <CardHeader bordered>
          <CardTitle>Open positions</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-center px-5 py-12 text-center">
          <p className="max-w-sm text-label text-ink-muted">
            No open positions — this account was imported from a closed-trade
            statement. Connect it live to track open risk.
          </p>
        </div>
      </Card>
    );
  }

  const positions = positionsFor(account);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader bordered>
        <div>
          <CardTitle>Open positions</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            {positions.length} positions · {money(notionalFor(account))} notional
          </p>
        </div>
        <Button variant="ghost" size="sm">
          View all
          <ArrowUpRight aria-hidden />
        </Button>
      </CardHeader>

      <Table>
        <caption className="sr-only">
          Open positions with entry price, mark price and unrealized profit or loss
        </caption>
        <THead>
          <tr>
            <TH>Instrument</TH>
            <TH>Side</TH>
            <TH numeric>Entry</TH>
            <TH numeric>Mark</TH>
            <TH numeric>Unrealized</TH>
            <TH>Risk</TH>
          </tr>
        </THead>
        <tbody>
          {positions.map((p) => {
            const up = p.pnl >= 0;
            return (
              <TR key={p.pair}>
                <TD>
                  <span className="font-medium tnum text-ink">{p.pair}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                    {p.market} · {p.size}
                  </span>
                </TD>
                <TD>
                  <Badge tone={p.side === "Long" ? "accent" : "neutral"}>
                    {p.side}
                  </Badge>
                </TD>
                <TD numeric>{price(p.entry)}</TD>
                <TD numeric className="text-ink">
                  {price(p.mark)}
                </TD>
                <TD numeric>
                  {/* Sign and arrow carry direction, so colour is never alone. */}
                  <span
                    className={cn("font-medium", up ? "text-profit" : "text-loss")}
                  >
                    {money(p.pnl, { signed: true })}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                    {pct(p.pnlPct, { signed: true })}
                  </span>
                </TD>
                <TD>
                  <Badge tone={riskTone[p.risk]} dot>
                    {p.risk}
                  </Badge>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
