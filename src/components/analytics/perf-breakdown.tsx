"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
};

/** Compact figure for the bar label, reference-style: "10.2k". */
function kfmt(v: number) {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "+";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}m`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(a)}`;
}

/**
 * "When do I make money?" as a KPI bar card, per the reference: a headline
 * total with a delta chip, then rounded bars per period — the standout bar
 * carries its value (selective direct labels, per dataviz), everything else
 * stays quiet. Hovering any bar raises a stats tooltip and moves the
 * highlight. Colour follows the SIGN of each period's P&L, never its rank.
 */
export function PerfBreakdown({ account }: { account: Account }) {
  const [view, setView] = useState<View>("Day");
  const [hover, setHover] = useState<number | null>(null);

  const rows: Breakdown[] = useMemo(() => {
    const data =
      view === "Day"
        ? byWeekday(account)
        : view === "Month"
          ? byMonth(account)
          : byYear(account);
    return data.filter((d) => d.trades > 0);
  }, [view, account]);

  const totalPnl = rows.reduce((a, d) => a + d.pnl, 0);
  const totalTrades = rows.reduce((a, d) => a + d.trades, 0) || 1;
  const totalWins = rows.reduce((a, d) => a + d.wins, 0);
  const winRate = Math.round((totalWins / totalTrades) * 100);
  const maxAbs = Math.max(...rows.map((d) => Math.abs(d.pnl)), 1);

  // The reference keeps one bar highlighted at rest; hover takes over.
  const bestIdx = rows.reduce(
    (bi, d, i) => (Math.abs(d.pnl) > Math.abs(rows[bi].pnl) ? i : bi),
    0,
  );
  const active = hover ?? bestIdx;
  const up = totalPnl >= 0;

  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Performance</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            Net P&amp;L by {view.toLowerCase()}
          </p>
        </div>
        <SegmentedControl
          options={VIEWS}
          value={view}
          onChange={(v) => {
            setView(v);
            setHover(null);
          }}
          ariaLabel="Breakdown period"
        />
      </CardHeader>

      <CardContent>
        {/* Headline + delta chip, reference-style. */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn("text-metric tnum", up ? "text-ink" : "text-loss")}
          >
            {money(Math.round(totalPnl), { signed: true })}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-label font-medium",
              up ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss",
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden />
            )}
            {winRate}% win rate
          </span>
        </div>

        {/* Bars. Height carries magnitude; colour carries sign. */}
        <div className="mt-3 flex items-end gap-2 sm:gap-3">
          {rows.map((d, i) => {
            const isActive = i === active;
            const pos = d.pnl >= 0;
            const h = Math.max(10, (Math.abs(d.pnl) / maxAbs) * 100);
            const share = Math.round((d.trades / totalTrades) * 100);
            const rate = d.trades ? Math.round((d.wins / d.trades) * 100) : 0;
            return (
              <button
                key={d.label}
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${LONG_LABEL[d.label] ?? d.label}: ${money(d.pnl, { signed: true })}, ${d.trades} trades, ${rate}% win rate`}
                className="group relative min-w-0 flex-1 cursor-pointer outline-none"
              >
                {/* Value label — only on the highlighted bar. */}
                <span
                  className={cn(
                    "block h-4 text-center text-[11.5px] tnum font-medium transition-opacity duration-150 ease-out",
                    isActive ? "opacity-100" : "opacity-0",
                    pos ? "text-ink" : "text-loss",
                  )}
                  aria-hidden
                >
                  {kfmt(d.pnl)}
                </span>

                <span className="flex h-[72px] items-end">
                  <span
                    className={cn(
                      "mx-auto block w-full max-w-14 rounded-md transition-[opacity,transform] duration-200 ease-out",
                      "group-focus-visible:ring-2 group-focus-visible:ring-accent",
                      isActive ? "opacity-100" : "opacity-40 group-hover:opacity-70",
                    )}
                    style={{
                      height: `${h}%`,
                      background: `linear-gradient(180deg, color-mix(in oklab, var(--color-${pos ? "profit" : "loss"}) 82%, white), var(--color-${pos ? "profit" : "loss"}))`,
                    }}
                  />
                </span>

                <span
                  className={cn(
                    "mt-1.5 block text-center text-[11px] transition-colors duration-150 ease-out",
                    isActive ? "text-ink" : "text-ink-muted",
                  )}
                  aria-hidden
                >
                  {d.label}
                </span>

                {/* Hover stats — same tooltip surface as the charts. */}
                <span
                  role="tooltip"
                  className={cn(
                    "pointer-events-none invisible absolute bottom-[calc(100%+4px)] left-1/2 z-30 w-44 -translate-x-1/2",
                    "rounded-md border border-line bg-overlay px-3 py-2.5 text-left shadow-pop",
                    "opacity-0 transition-opacity duration-150 ease-out",
                    "group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100",
                  )}
                >
                  <span className="block text-label text-ink-muted">
                    {LONG_LABEL[d.label] ?? d.label}
                  </span>
                  <span className="mt-1.5 block space-y-1">
                    <Row k="Net P&L" v={money(d.pnl, { signed: true })} tone={pos ? "profit" : "loss"} />
                    <Row k="Trades" v={`${d.trades} (${share}%)`} />
                    <Row k="Win rate" v={`${rate}%`} />
                  </span>
                </span>
              </button>
            );
          })}
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
