"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/input";
import { equitySeries, RANGES, type Account, type Range } from "@/lib/data";
import { cn, money, pct } from "@/lib/utils";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type TipProps = {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
};

function ChartTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const equity = payload.find((p) => p.dataKey === "equity")?.value;
  const benchmark = payload.find((p) => p.dataKey === "benchmark")?.value;

  return (
    <div className="rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop">
      <p className="text-label text-ink-muted">{label && shortDate(label)}</p>
      <div className="mt-2 space-y-1.5">
        <Row color="var(--color-chart-1)" name="Strategy" value={equity} />
        <Row color="var(--color-chart-2)" name="Benchmark" value={benchmark} />
      </div>
    </div>
  );
}

function Row({
  color,
  name,
  value,
}: {
  color: string;
  name: string;
  value?: number;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {/* Text wears text tokens; the swatch carries identity. */}
      <span className="text-label text-ink-secondary">{name}</span>
      <span className="ml-auto text-label tnum font-medium text-ink">
        {money(value)}
      </span>
    </div>
  );
}

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
  const [range, setRange] = useState<Range>("3M");
  const data = useMemo(() => equitySeries(range, account), [range, account]);

  const changeRange = (r: Range) => {
    setRange(r);
    onRangeChange?.(r);
  };

  // Imported accounts have no benchmark index in their statement.
  const showBenchmark = account.hasBenchmark !== false;

  const first = data[0]?.equity ?? 0;
  const last = data[data.length - 1]?.equity ?? 0;
  const change = ((last - first) / first) * 100;

  return (
    // min-w-0 is required: without it the Recharts container refuses to shrink
    // below its intrinsic width and forces horizontal page overflow on mobile.
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
      <div className="flex items-center gap-4 px-5 pb-3">
        <LegendKey color="var(--color-chart-1)" label="Strategy" />
        {showBenchmark && (
          <LegendKey color="var(--color-chart-2)" label="Benchmark" dashed />
        )}
      </div>

      <div className="w-full min-w-0 px-1 pb-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="var(--color-chart-grid)"
              strokeDasharray="0"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
              domain={["dataMin - 8000", "dataMax + 8000"]}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            />

            {/* Benchmark sits behind, dashed and quiet. Absent for imports. */}
            {showBenchmark && (
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="var(--color-chart-2)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
            <Area
              type="monotone"
              dataKey="equity"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#equityFill)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--color-chart-1)",
                stroke: "var(--color-surface)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function LegendKey({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-0.5 w-4 rounded-full"
        style={
          dashed
            ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` }
            : { background: color }
        }
        aria-hidden
      />
      <span className="text-label text-ink-secondary">{label}</span>
    </span>
  );
}
