"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnderwaterPlot } from "@/components/analytics/underwater-plot";
import {
  dailyEquityFor,
  drawdownEpisodes,
  returnComparison,
  riskAnalytics,
  rollingVolatility,
  type Account,
} from "@/lib/data";
import { cn, money } from "@/lib/utils";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function fullDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type TipProps = {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
};

function PctTip({
  active,
  payload,
  label,
  name,
}: TipProps & { name: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop">
      <p className="text-label text-ink-muted">{label && fullDate(label)}</p>
      <p className="mt-1 text-label tnum font-medium text-ink">
        {name} {payload[0].value.toFixed(2)}%
      </p>
    </div>
  );
}

/**
 * Cumulative return with the five worst drawdown windows shaded — the
 * reference's "drawdown comparison" read, on the app's tokens. The bands make
 * the pain periods legible without a second axis.
 */
function DrawdownComparison({ account }: { account: Account }) {
  const { points, bands } = useMemo(() => returnComparison(account), [account]);
  const last = points[points.length - 1]?.ret ?? 0;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Drawdown comparison</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span
              className={cn(
                "text-metric",
                last >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {last >= 0 ? "+" : "−"}
              {Math.abs(last).toFixed(1)}%
            </span>
            <span className="text-label text-ink-muted">
              cumulative return · shaded areas mark the 5 worst drawdowns
            </span>
          </div>
        </div>
      </CardHeader>

      <div className="h-[300px] w-full min-w-0 px-1 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="ddcFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
            />
            <Tooltip
              content={<PctTip name="Return" />}
              cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            />
            {/* The pain windows. Bands sit behind the line. */}
            {bands.map((b, i) => (
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
            <Area
              type="monotone"
              dataKey="ret"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#ddcFill)"
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

/** Rolling 30-day annualised volatility — the reference's volatility panel. */
function VolatilityChart({ account }: { account: Account }) {
  const data = useMemo(() => rollingVolatility(account), [account]);
  const latest = data[data.length - 1]?.vol ?? 0;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Volatility</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-metric text-ink">{latest.toFixed(1)}%</span>
            <span className="text-label text-ink-muted">
              30-day rolling, annualised
            </span>
          </div>
        </div>
      </CardHeader>

      <div className="h-[240px] w-full min-w-0 px-1 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
            />
            <Tooltip
              content={<PctTip name="Volatility" />}
              cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="vol"
              stroke="var(--color-chart-2)"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--color-chart-2)",
                stroke: "var(--color-surface)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** The reference's risk-metrics list, computed — never invented. */
function RiskMetricsCard({ account }: { account: Account }) {
  const r = useMemo(() => riskAnalytics(account), [account]);

  // Annualising a very short history produces absurd figures (a good week
  // compounds to millions of percent). Below ~2 months, show the honest "—".
  const days = useMemo(() => {
    const d = dailyEquityFor(account);
    return d.length > 1
      ? (d[d.length - 1].date.getTime() - d[0].date.getTime()) / 86_400_000
      : 0;
  }, [account]);
  const annualisable = days >= 60;

  const rows = [
    {
      label: "Max drawdown ($)",
      value: `−${money(Math.round(r.maxDrawdownAbs))}`,
      tone: "loss" as const,
    },
    {
      label: "Max drawdown (%)",
      value: `−${Math.abs(r.maxDrawdownPct).toFixed(2)}%`,
      tone: "loss" as const,
    },
    {
      label: "Average drawdown",
      value: `−${Math.abs(r.avgDrawdownPct).toFixed(2)}%`,
      tone: "loss" as const,
    },
    {
      label: "Average drawdown length",
      value: `${Math.round(r.avgDrawdownDays)} days`,
      tone: "neutral" as const,
    },
    {
      label: "Annualised return",
      value: annualisable
        ? `${r.cagrPct >= 0 ? "+" : "−"}${Math.abs(r.cagrPct).toFixed(1)}%`
        : "—",
      tone:
        annualisable && r.cagrPct < 0 ? ("loss" as const) : annualisable ? ("profit" as const) : ("neutral" as const),
    },
    { label: "Sortino", value: r.sortino.toFixed(2), tone: "profit" as const },
    {
      label: "Calmar",
      value: annualisable ? r.calmar.toFixed(2) : "—",
      tone: annualisable ? ("profit" as const) : ("neutral" as const),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <ul>
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0"
            >
              <span className="text-label text-ink-secondary">{row.label}</span>
              <span
                className={cn(
                  "text-body font-semibold tnum",
                  row.tone === "loss"
                    ? "text-loss"
                    : row.tone === "profit"
                      ? "text-profit"
                      : "text-ink",
                )}
              >
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Worst five drawdowns — start, recovery, depth, duration. */
function WorstDrawdownsCard({ account }: { account: Account }) {
  const episodes = useMemo(
    () => drawdownEpisodes(account).slice(0, 5),
    [account],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader bordered>
        <CardTitle>Worst 5 drawdowns</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-raised">
            <tr>
              {["Started", "Recovered", "Drawdown", "Days"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cn(
                    "border-y border-line px-5 py-2.5 text-eyebrow font-medium whitespace-nowrap text-ink-muted",
                    i >= 2 && "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {episodes.map((e, i) => (
              <tr
                key={i}
                className="border-b border-line transition-colors duration-150 ease-out last:border-0 hover:bg-raised"
              >
                <td className="px-5 py-3 text-body whitespace-nowrap text-ink">
                  {fullDate(e.start)}
                </td>
                <td className="px-5 py-3 text-body whitespace-nowrap text-ink-secondary">
                  {e.recovered ? (
                    fullDate(e.recovered)
                  ) : (
                    <span className="text-warn">Ongoing</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-body font-medium tnum whitespace-nowrap text-loss">
                  −{Math.abs(e.depthPct).toFixed(2)}%
                </td>
                <td className="px-5 py-3 text-right text-body tnum whitespace-nowrap text-ink-secondary">
                  {e.days}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RiskTab({ account }: { account: Account }) {
  return (
    <>
      <section aria-label="Drawdown comparison">
        <DrawdownComparison account={account} />
      </section>

      <section
        aria-label="Underwater and volatility"
        className="grid grid-cols-1 gap-5 xl:grid-cols-2"
      >
        <UnderwaterPlot account={account} range="Max" height={240} />
        <VolatilityChart account={account} />
      </section>

      <section
        aria-label="Risk metrics and worst drawdowns"
        className="grid grid-cols-1 gap-5 xl:grid-cols-2"
      >
        <RiskMetricsCard account={account} />
        <WorstDrawdownsCard account={account} />
      </section>
    </>
  );
}
