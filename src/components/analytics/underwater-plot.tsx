"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CROSSHAIR,
  ChartReadout,
  Read,
  usePlotHover,
} from "@/components/ui/chart-readout";
import { underwaterSeries, type Account, type Range } from "@/lib/data";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Underwater plot: percentage below the running equity peak. Always <= 0, so
 * the y-axis is inverted-by-nature and the fill hangs from the zero line —
 * time spent "underwater" is the visual point.
 */
export function UnderwaterPlot({
  account,
  range,
  height = 200,
}: {
  account: Account;
  range: Range;
  height?: number;
}) {
  const data = useMemo(() => underwaterSeries(range, account), [range, account]);
  const trough = Math.min(...data.map((d) => d.drawdown));
  const atPeak = data.filter((d) => d.drawdown > -0.01).length;
  const { index, handlers } = usePlotHover({
    count: data.length,
    padLeft: 8 + 44,
    padRight: 16,
  });

  // Readout follows the pointer; with nothing hovered it reports the last point.
  const hoverAt = index === null ? null : data[index];
  const at = hoverAt ?? data[data.length - 1];
  const dd = at?.drawdown ?? 0;
  const troughIdx = data.findIndex((d) => d.drawdown === trough);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Underwater plot</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-metric text-loss">
              −{Math.abs(trough).toFixed(2)}%
            </span>
            <span className="text-label text-ink-muted">
              deepest drawdown in range
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink-muted">Days at peak</p>
          <p className="mt-0.5 text-body font-semibold tnum text-ink">
            {atPeak}
          </p>
        </div>
      </CardHeader>

      <div
        className="w-full min-w-0 cursor-crosshair px-1 pb-3"
        style={{ height }}
        {...handlers}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="uwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-loss)" stopOpacity={0.02} />
                <stop offset="100%" stopColor="var(--color-loss)" stopOpacity={0.22} />
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
              // Shallow drawdowns need a decimal, or successive ticks round to
              // the same label ("-1%", "-1%").
              tickFormatter={(v: number) =>
                `${v.toFixed(Math.abs(trough) < 5 ? 1 : 0)}%`
              }
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
              domain={[() => trough * 1.15, 0]}
            />
            {/* Crosshair — the figures live in the readout row below. */}
            {hoverAt && <ReferenceLine x={hoverAt.date} {...CROSSHAIR} />}
            {/* The zero line is the peak — the reference everything hangs from. */}
            <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />

            <Area
              type="monotone"
              dataKey="drawdown"
              stroke="var(--color-loss)"
              strokeWidth={1.5}
              fill="url(#uwFill)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--color-loss)",
                stroke: "var(--color-surface)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="px-5 pb-4">
        <ChartReadout>
          <Read label={at ? shortDate(at.date) : "—"} value="" plain />
          <Read
            label="Below peak"
            value={dd === 0 ? "At peak" : `−${Math.abs(dd).toFixed(2)}%`}
            colorVar="--color-loss"
          />
          <Read
            label="Deepest"
            value={`−${Math.abs(trough).toFixed(2)}%`}
            colorVar="--color-loss"
          />
          <Read
            label="Deepest on"
            value={troughIdx >= 0 ? shortDate(data[troughIdx].date) : "—"}
            plain
          />
          <Read label="Days at peak" value={`${atPeak}`} plain />
          <Read label="Observations" value={`${data.length}`} plain />
        </ChartReadout>
      </div>
    </Card>
  );
}
