"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { underwaterSeries, type Account, type Range } from "@/lib/data";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type TipProps = {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
};

function Tip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop">
      <p className="text-label text-ink-muted">{label && shortDate(label)}</p>
      <p className="mt-1 text-label tnum font-medium text-ink">
        {v === 0 ? "At peak" : `−${Math.abs(v).toFixed(2)}% below peak`}
      </p>
    </div>
  );
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

      <div className="w-full min-w-0 px-1 pb-3" style={{ height }}>
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
            <Tooltip
              content={<Tip />}
              cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            />
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
    </Card>
  );
}
