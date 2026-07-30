import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pairsFor, tradesFor, type Account } from "@/lib/data";
import { cn, money } from "@/lib/utils";

export function TradesFeed({ account }: { account: Account }) {
  const trades = tradesFor(account);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closed trades</CardTitle>
        <Button variant="ghost" size="sm">
          View all
        </Button>
      </CardHeader>

      <CardContent>
        <ol className="space-y-3">
          {trades.map((t, i) => {
            const win = t.pnl >= 0;
            return (
              <li
                key={i}
                className="flex items-center gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium tnum text-ink">
                      {t.pair}
                    </span>
                    <Badge tone={t.side === "Long" ? "accent" : "neutral"}>
                      {t.side}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">{t.time}</p>
                </div>

                <span
                  className={cn(
                    "ml-auto shrink-0 text-body font-medium tnum",
                    win ? "text-profit" : "text-loss",
                  )}
                >
                  {money(t.pnl, { signed: true })}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function TradedPairs({ account }: { account: Account }) {
  const pairs = pairsFor(account);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traded pairs</CardTitle>
        <span className="text-label text-ink-muted">By volume</span>
      </CardHeader>

      <CardContent>
        {/* Stacked bar with 2px surface gaps between segments. */}
        <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
          {pairs.map((p, i) => (
            <span
              key={p.name}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${p.value}%`,
                background: `var(--color-pair-${i + 1})`,
              }}
              aria-hidden
            />
          ))}
        </div>

        <ul className="mt-4">
          {pairs.map((p, i) => (
            <li
              key={p.name}
              className="flex items-center gap-2.5 border-b border-line py-3 last:border-0 last:pb-0"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: `var(--color-pair-${i + 1})` }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-body font-medium tnum text-ink">{p.name}</p>
                <p className="mt-0.5 text-[11.5px] tnum text-ink-muted">
                  {p.trades} trades · {p.winRate}% win
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-body tnum font-medium text-ink">{p.value}%</p>
                <p
                  className={cn(
                    "mt-0.5 text-[11.5px] tnum",
                    p.pnl >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {money(p.pnl, { signed: true })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
