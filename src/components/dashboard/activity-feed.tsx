"use client";

import { useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipBox, TooltipContent } from "@/components/ui/area-chart";
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
          <ArrowUpRight aria-hidden />
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

  // Same crossover anatomy as the equity curve: the floating tooltip card
  // follows the pointer across the share bar.
  const barRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoverPx, setHoverPx] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverPx({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      w: r.width,
      h: r.height,
    });
  };

  const active = pairs.find((p) => p.name === hovered);
  const activeIndex = pairs.findIndex((p) => p.name === hovered);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traded pairs</CardTitle>
        <span className="text-label text-ink-muted">By volume</span>
      </CardHeader>

      <CardContent>
        {/* Stacked bar with 2px surface gaps between segments. */}
        <div
          ref={barRef}
          className="relative flex h-2 w-full gap-[2px] rounded-full"
          onMouseMove={onMove}
          onMouseLeave={() => {
            setHovered(null);
            setHoverPx(null);
          }}
        >
          {pairs.map((p, i) => (
            <span
              key={p.name}
              tabIndex={0}
              onMouseEnter={() => setHovered(p.name)}
              onFocus={() => setHovered(p.name)}
              onBlur={() => setHovered(null)}
              aria-label={`${p.name}: ${p.value}% of volume, ${p.trades} trades, ${p.winRate}% win`}
              className={cn(
                "h-full cursor-pointer rounded-full outline-none",
                "transition-opacity duration-150 ease-out",
                "focus-visible:ring-2 focus-visible:ring-accent",
                hovered !== null && hovered !== p.name && "opacity-30",
              )}
              style={{
                width: `${p.value}%`,
                background: `var(--color-pair-${i + 1})`,
              }}
            />
          ))}

          {active && hoverPx && (
            <TooltipBox
              containerHeight={hoverPx.h}
              containerRef={barRef}
              containerWidth={hoverPx.w}
              offset={14}
              visible
              x={hoverPx.x}
              y={hoverPx.y}
            >
              <TooltipContent
                title={active.name}
                rows={[
                  {
                    color: `var(--color-pair-${activeIndex + 1})`,
                    label: "Share of volume",
                    value: `${active.value}%`,
                  },
                  {
                    color: "var(--color-ink-muted)",
                    label: "Trades",
                    value: `${active.trades} · ${active.winRate}% win`,
                  },
                  {
                    color: `var(--color-${active.pnl >= 0 ? "profit" : "loss"})`,
                    label: "Net P&L",
                    value: money(active.pnl, { signed: true }),
                  },
                ]}
              />
            </TooltipBox>
          )}
        </div>

        <ul className="mt-4">
          {pairs.map((p, i) => (
            <li
              key={p.name}
              onMouseEnter={() => setHovered(p.name)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 border-b border-line py-3 last:border-0 last:pb-0",
                "transition-opacity duration-150 ease-out",
                hovered !== null && hovered !== p.name && "opacity-40",
              )}
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
