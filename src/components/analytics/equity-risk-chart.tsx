"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import {
  CROSSHAIR,
  ChartReadout,
  Read,
  usePlotHover,
} from "@/components/ui/chart-readout";
import { equityRiskSeries, type Account } from "@/lib/data";
import { cn } from "@/lib/utils";

const Y_WIDTH = 56;
const MARGIN = { top: 4, right: 16, bottom: 0, left: 8 } as const;
const EQUITY_H = 280;
const UNDER_H = 120;

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const signed = (v: number, dp = 2) =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`;

type LayerId = "stagnation" | "trend" | "drawdowns" | "highs" | "underwater";

const LAYERS: { id: LayerId; label: string; colorVar?: string }[] = [
  { id: "stagnation", label: "Stagnation period", colorVar: "--color-loss" },
  { id: "trend", label: "Trend line", colorVar: "--color-loss" },
  { id: "drawdowns", label: "Worst 5 drawdowns", colorVar: "--color-loss" },
  { id: "highs", label: "New equity highs", colorVar: "--color-profit" },
  { id: "underwater", label: "Underwater panel", colorVar: "--color-loss" },
];

/**
 * Equity curve with the underwater plot stacked directly beneath it, sharing
 * one x-domain — the reference layout. Two measures of different scale get two
 * panels rather than a second y-axis, and the layers that annotate the curve
 * (stagnation, trend, drawdown windows, new highs) are switchable so the chart
 * can be read plain or fully marked up.
 */
export function EquityRiskChart({ account }: { account: Account }) {
  const { points, bands, highs, stagnation, trend } = useMemo(
    () => equityRiskSeries(account),
    [account],
  );

  const [on, setOn] = useState<Record<LayerId, boolean>>({
    stagnation: true,
    trend: false,
    drawdowns: true,
    highs: false,
    underwater: true,
  });

  // A "high" column so new peaks render as dots on an invisible line — far
  // cheaper than one ReferenceDot per peak on a multi-year series.
  const data = useMemo(() => {
    const set = new Set(highs);
    return points.map((p) => ({ ...p, high: set.has(p.date) ? p.ret : null }));
  }, [points, highs]);

  const { index, handlers } = usePlotHover({
    count: data.length,
    padLeft: MARGIN.left + Y_WIDTH,
    padRight: MARGIN.right,
  });

  const hoverAt = index === null ? null : data[index];
  const at = hoverAt ?? data[data.length - 1];
  const last = points[points.length - 1]?.ret ?? 0;
  const peak = Math.max(...points.map((p) => p.ret), 0);
  const trough = Math.min(...points.map((p) => p.dd), 0);

  const xAxis = (visible: boolean) => (
    <XAxis
      dataKey="date"
      tickFormatter={shortDate}
      tickLine={false}
      axisLine={false}
      minTickGap={60}
      tick={visible ? { fill: "var(--color-ink-muted)", fontSize: 11 } : false}
      height={visible ? 24 : 0}
      dy={6}
    />
  );

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Equity curve</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span
              className={cn("text-metric", last >= 0 ? "text-profit" : "text-loss")}
            >
              {signed(last, 1)}
            </span>
            <span className="text-label text-ink-muted">
              cumulative return · drawdown below
            </span>
          </div>
        </div>
      </CardHeader>

      <div className="flex min-w-0 flex-col gap-4 px-1 pb-3 lg:flex-row">
        <div className="min-w-0 flex-1 cursor-crosshair" {...handlers}>
          <div style={{ height: EQUITY_H }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={MARGIN} syncId="equityRisk">
                <defs>
                  <linearGradient id="eqcFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                {xAxis(!on.underwater)}
                <YAxis
                  tickFormatter={(v: number) => `${Math.round(v)}%`}
                  tickLine={false}
                  axisLine={false}
                  width={Y_WIDTH}
                  tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                />

                {/* Longest run without a new high, labelled with its length. */}
                {on.stagnation && stagnation && stagnation.days > 0 && (
                  <ReferenceArea
                    x1={stagnation.from}
                    x2={stagnation.to}
                    fill="var(--color-loss)"
                    fillOpacity={0.1}
                    stroke="var(--color-loss)"
                    strokeOpacity={0.2}
                    label={{
                      value: `Max stagnation: ${stagnation.days.toLocaleString("en-US")} days${stagnation.ongoing ? " (ongoing)" : ""}`,
                      position: "insideTop",
                      fill: "var(--color-loss)",
                      fontSize: 11,
                      offset: 8,
                    }}
                  />
                )}

                {on.drawdowns &&
                  bands.map((b, i) => (
                    <ReferenceArea
                      key={i}
                      x1={b.from}
                      x2={b.to}
                      fill="var(--color-loss)"
                      fillOpacity={0.09}
                      stroke="var(--color-loss)"
                      strokeOpacity={0.18}
                    />
                  ))}

                <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />

                {on.trend && trend && (
                  <ReferenceLine
                    segment={[
                      { x: data[0].date, y: trend.from },
                      { x: data[data.length - 1].date, y: trend.to },
                    ]}
                    stroke="var(--color-loss)"
                    strokeWidth={1.5}
                    strokeOpacity={0.75}
                  />
                )}

                {hoverAt && <ReferenceLine x={hoverAt.date} {...CROSSHAIR} />}

                <Area
                  type="monotone"
                  dataKey="ret"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="url(#eqcFill)"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />

                {on.highs && (
                  <Line
                    type="monotone"
                    dataKey="high"
                    stroke="none"
                    connectNulls={false}
                    dot={{ r: 2, fill: "var(--color-profit)", stroke: "none" }}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Underwater panel — same x-domain, hung from the zero line. */}
          {on.underwater && (
            <div style={{ height: UNDER_H }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={MARGIN} syncId="equityRisk">
                  <defs>
                    <linearGradient id="eqcUw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-loss)" stopOpacity={0.04} />
                      <stop offset="100%" stopColor="var(--color-loss)" stopOpacity={0.28} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                  {xAxis(true)}
                  <YAxis
                    tickFormatter={(v: number) =>
                      `${v.toFixed(Math.abs(trough) < 5 ? 1 : 0)}%`
                    }
                    tickLine={false}
                    axisLine={false}
                    width={Y_WIDTH}
                    tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                    domain={[() => trough * 1.15, 0]}
                  />
                  <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />
                  {hoverAt && <ReferenceLine x={hoverAt.date} {...CROSSHAIR} />}
                  <Area
                    type="monotone"
                    dataKey="dd"
                    stroke="var(--color-loss)"
                    strokeWidth={1.5}
                    fill="url(#eqcUw)"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Layer switches. */}
        <div className="shrink-0 lg:w-52 lg:border-l lg:border-line lg:pl-4">
          <p className="mb-1.5 text-eyebrow text-ink-muted">Layers</p>
          <div className="flex flex-wrap gap-x-4 lg:block">
            {LAYERS.map((l) => (
              <Toggle
                key={l.id}
                label={l.label}
                colorVar={l.colorVar}
                checked={on[l.id]}
                onChange={(v) => setOn((s) => ({ ...s, [l.id]: v }))}
              />
            ))}
          </div>
          {stagnation && stagnation.days > 0 && (
            <p className="mt-3 hidden text-[11px] leading-4 text-ink-muted lg:block">
              Longest run without a new high:{" "}
              <span className="tnum text-ink-secondary">
                {stagnation.days.toLocaleString("en-US")} days
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="px-5 pb-4">
        <ChartReadout>
          <Read label={at ? fullDate(at.date) : "—"} value="" plain />
          <Read
            label="Cumulative return"
            value={signed(at?.ret ?? 0)}
            colorVar="--color-chart-1"
          />
          <Read
            label="Below peak"
            value={(at?.dd ?? 0) >= -0.005 ? "At peak" : `−${Math.abs(at?.dd ?? 0).toFixed(2)}%`}
            colorVar="--color-loss"
          />
          <Read label="Best so far" value={signed(peak)} plain />
          <Read label="Deepest drawdown" value={`−${Math.abs(trough).toFixed(2)}%`} plain />
          <Read
            label="Max stagnation"
            value={stagnation ? `${stagnation.days.toLocaleString("en-US")} days` : "—"}
            plain
          />
        </ChartReadout>
      </div>
    </Card>
  );
}
