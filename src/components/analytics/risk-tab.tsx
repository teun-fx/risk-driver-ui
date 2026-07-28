"use client";

import { useMemo } from "react";
import {
  Area as VxArea,
  AreaChart as VxAreaChart,
  ChartTooltip as VxChartTooltip,
  Grid as VxGrid,
  XAxis as VxXAxis,
  YAxis as VxYAxis,
} from "@/components/ui/area-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EquityRiskChart } from "@/components/analytics/equity-risk-chart";
import {
  dailyEquityFor,
  drawdownEpisodes,
  riskAnalytics,
  rollingVolatility,
  type Account,
} from "@/lib/data";
import { cn, money } from "@/lib/utils";

function fullDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Rolling 30-day annualised volatility — picture-3 chart anatomy. */
function VolatilityChart({ account }: { account: Account }) {
  const data = useMemo(
    () =>
      rollingVolatility(account).map((d) => ({ date: d.date, vol: d.vol })),
    [account],
  );
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

      <div className="w-full min-w-0 pb-1">
        <VxAreaChart data={data} height={260} key={account.id}>
          <VxGrid />
          <VxArea
            dataKey="vol"
            fill="var(--chart-line-secondary)"
            fillOpacity={0.22}
            fadeEdges
          />
          <VxXAxis />
          <VxYAxis formatValue={(v) => `${v.toFixed(1)}%`} />
          <VxChartTooltip
            rows={(point) => [
              {
                color: "var(--chart-line-secondary)",
                label: "Volatility",
                value: `${(point.vol as number).toFixed(2)}%`,
              },
            ]}
          />
        </VxAreaChart>
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
      <section aria-label="Equity curve and drawdown">
        <EquityRiskChart account={account} />
      </section>

      <section aria-label="Volatility">
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
