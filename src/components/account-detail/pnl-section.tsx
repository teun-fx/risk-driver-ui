"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/input";
import { cumulativeSeries, kpis, type ChartMode } from "@/lib/account-analytics";
import type { Account, HistTrade } from "@/lib/data";
import { cn, money } from "@/lib/utils";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function PnlSection({
  account,
  trades,
}: {
  account: Account;
  trades: HistTrade[];
}) {
  // R needs a known risk-per-trade; never invent one.
  const modes = useMemo<ChartMode[]>(
    () =>
      account.riskPerTrade
        ? ["P&L", "Return %", "R", "Balance"]
        : ["P&L", "Return %", "Balance"],
    [account.riskPerTrade],
  );
  const [mode, setMode] = useState<ChartMode>("P&L");

  const { points, bands } = useMemo(
    () => cumulativeSeries(account, trades, mode),
    [account, trades, mode],
  );
  const k = useMemo(() => kpis(account, trades), [account, trades]);

  const fmt = (v: number) =>
    mode === "Return %"
      ? `${v.toFixed(1)}%`
      : mode === "R"
        ? `${v.toFixed(1)}R`
        : money(Math.round(v));
  const axisFmt = (v: number) =>
    mode === "Return %"
      ? `${Math.round(v)}%`
      : mode === "R"
        ? `${Math.round(v)}R`
        : `${Math.round(v / 1000)}k`;

  const data = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        pos: p.value >= 0 ? p.value : 0,
        neg: p.value < 0 ? p.value : 0,
      })),
    [points],
  );

  const last = points[points.length - 1]?.value ?? 0;

  const tiles: {
    label: string;
    value: string;
    tone?: "profit" | "loss";
    hint?: string;
  }[] = [
    {
      label: "Net profit",
      value: money(Math.round(k.netPnl), { signed: true }),
      tone: k.netPnl >= 0 ? "profit" : "loss",
    },
    {
      label: "Win rate",
      value: `${k.winRate.toFixed(1)}%`,
      hint: `${k.breakEven} break-even excluded`,
    },
    {
      label: "Profit factor",
      value: k.profitFactor != null ? k.profitFactor.toFixed(2) : "∞",
    },
    {
      label: "Expectancy / trade",
      value: money(Math.round(k.expectancy), { signed: true }),
      tone: k.expectancy >= 0 ? "profit" : "loss",
    },
    {
      label: "Avg risk-reward",
      value: k.avgRR != null ? `1 : ${k.avgRR.toFixed(2)}` : "—",
    },
    {
      label: "Max drawdown",
      value: `−${money(Math.round(k.maxDrawdownAbs)).replace("$", "$")} (${k.maxDrawdownPct.toFixed(1)}%)`,
      tone: "loss",
    },
    {
      label: "Recovery factor",
      value: k.recoveryFactor != null ? k.recoveryFactor.toFixed(2) : "—",
    },
    {
      label: "Total commissions",
      value: k.commissions != null ? money(Math.round(k.commissions)) : "—",
      hint: k.commissions == null ? "re-upload statement" : undefined,
    },
  ];

  return (
    <section aria-label="Cumulative performance" className="space-y-5">
      <Card className="min-w-0">
        <CardHeader className="items-center">
          <div>
            <CardTitle>Cumulative {mode === "Balance" ? "balance" : "P&L"}</CardTitle>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span
                className={cn(
                  "text-metric",
                  mode === "Balance"
                    ? "text-ink"
                    : last >= 0
                      ? "text-profit"
                      : "text-loss",
                )}
              >
                {mode === "Balance" ? fmt(last) : `${last >= 0 ? "+" : "−"}${fmt(Math.abs(last)).replace("−", "")}`}
              </span>
              <span className="text-label text-ink-muted">
                dashed line = high-water mark · shaded = drawdown periods · drag
                below to zoom
              </span>
            </div>
          </div>
          <SegmentedControl
            options={modes}
            value={mode}
            onChange={setMode}
            ariaLabel="Chart unit"
          />
        </CardHeader>

        <div className="h-[340px] w-full min-w-0 px-1 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="cumPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="var(--color-profit)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cumNeg" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="var(--color-loss)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--color-loss)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
              <XAxis
                dataKey="i"
                tickFormatter={(i: number) => {
                  const p = points[i - 1];
                  return p ? shortDate(p.date) : "";
                }}
                tickLine={false}
                axisLine={false}
                minTickGap={70}
                tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                dy={6}
              />
              <YAxis
                tickFormatter={axisFmt}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop">
                      <p className="text-label text-ink-muted">
                        Trade {p.i} ·{" "}
                        {new Date(p.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <div className="mt-1.5 space-y-1 text-label tnum">
                        <p className="text-ink">{fmt(p.value)}</p>
                        <p className="text-ink-muted">High-water {fmt(p.hwm)}</p>
                      </div>
                    </div>
                  );
                }}
                cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
              />
              {bands.map((b, i) => (
                <ReferenceArea
                  key={i}
                  x1={b.from}
                  x2={b.to}
                  fill="var(--color-loss)"
                  fillOpacity={0.07}
                />
              ))}
              {mode !== "Balance" && (
                <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />
              )}
              <Area dataKey="pos" stroke="none" fill="url(#cumPos)" isAnimationActive={false} />
              <Area dataKey="neg" stroke="none" fill="url(#cumNeg)" isAnimationActive={false} />
              <Line
                dataKey="hwm"
                stroke="var(--color-chart-2)"
                strokeWidth={1.25}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="value"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--color-chart-1)",
                  stroke: "var(--color-surface)",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
              <Brush
                dataKey="i"
                height={22}
                travellerWidth={8}
                stroke="var(--color-line-strong)"
                fill="var(--color-raised)"
                tickFormatter={() => ""}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border border-line bg-surface px-4 py-3">
            <p className="text-eyebrow text-ink-muted">{t.label}</p>
            <p
              className={cn(
                "mt-1.5 text-[15px] leading-6 font-semibold tnum",
                t.tone === "profit"
                  ? "text-profit"
                  : t.tone === "loss"
                    ? "text-loss"
                    : "text-ink",
              )}
            >
              {t.value}
            </p>
            {t.hint && (
              <p className="mt-0.5 text-[10.5px] text-ink-muted">{t.hint}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
