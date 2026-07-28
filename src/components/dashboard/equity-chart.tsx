"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ChartTooltip,
  Grid,
  XAxis,
  YAxis,
} from "@/components/ui/area-chart";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/input";
import { equitySeries, RANGES, type Account, type Range } from "@/lib/data";
import { cn, money, pct } from "@/lib/utils";

export function EquityChart({
  account,
  height = 280,
  onRangeChange,
}: {
  account: Account;
  height?: number;
  /** Lets a parent keep a companion chart (the underwater plot) in sync. */
  onRangeChange?: (r: Range) => void;
}) {
  const imported = account.source === "html";
  // Imports span years — default to the full history, not a 3-month window.
  const [range, setRange] = useState<Range>(imported ? "Max" : "3M");

  // Re-apply the per-account default when the account changes — including the
  // post-mount switch when the persisted selection loads from localStorage
  // (the provider hydrates it in an effect, after this first render).
  useEffect(() => {
    const def: Range = account.source === "html" ? "Max" : "3M";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on account switch
    setRange(def);
    onRangeChange?.(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onRangeChange identity changes every parent render
  }, [account.id, account.source]);
  const data = useMemo(() => equitySeries(range, account), [range, account]);

  const changeRange = (r: Range) => {
    setRange(r);
    onRangeChange?.(r);
  };

  // Imported accounts have no benchmark index in their statement.
  const showBenchmark = account.hasBenchmark !== false;

  const first = data[0]?.equity ?? 0;
  const last = data[data.length - 1]?.equity ?? 0;
  // For imports the headline shows TOTAL return since inception (equity vs the
  // starting balance), independent of the zoom range — the range only shapes
  // the chart. A demo shows the change over the visible window.
  const change =
    imported && account.startingBalance
      ? ((account.equity - account.startingBalance) / account.startingBalance) *
        100
      : ((last - first) / first) * 100;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Equity curve</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-metric text-ink">{money(last)}</span>
            <span
              className={cn(
                "text-label tnum font-medium",
                change >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {pct(change, { signed: true })}
            </span>
          </div>
        </div>
        <SegmentedControl
          options={RANGES}
          value={range}
          onChange={changeRange}
          ariaLabel="Time range"
        />
      </CardHeader>

      {/* Legend present for both series; benchmark drops for imported accounts. */}
      <div className="flex items-center gap-4 px-5 pb-1">
        <LegendKey color="var(--color-chart-1)" label="Strategy" />
        {showBenchmark && (
          <LegendKey color="var(--color-chart-2)" label="Benchmark" />
        )}
      </div>

      <div className="w-full min-w-0 pb-1">
        <AreaChart data={data} height={height} key={`${account.id}-${range}`}>
          <Grid />
          <Area
            dataKey="equity"
            fill="var(--chart-line-primary)"
            fillOpacity={0.25}
            fadeEdges
          />
          {showBenchmark && (
            <Area
              dataKey="benchmark"
              fill="var(--chart-line-secondary)"
              fillOpacity={0.12}
              strokeWidth={1.5}
              fadeEdges
            />
          )}
          <XAxis />
          <YAxis formatValue={(v) => `${Math.round(v / 1000)}k`} />
          <ChartTooltip
            rows={(point) => {
              const rows = [
                {
                  color: "var(--chart-line-primary)",
                  label: "Strategy",
                  value: money(Math.round(point.equity as number)),
                },
              ];
              if (showBenchmark && typeof point.benchmark === "number")
                rows.push({
                  color: "var(--chart-line-secondary)",
                  label: "Benchmark",
                  value: money(Math.round(point.benchmark)),
                });
              return rows;
            }}
          />
        </AreaChart>
      </div>
    </Card>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-0.5 w-4 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-label text-ink-secondary">{label}</span>
    </span>
  );
}
