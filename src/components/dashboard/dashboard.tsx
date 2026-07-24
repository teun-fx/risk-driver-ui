"use client";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { EquityChart } from "@/components/dashboard/equity-chart";
import { RiskPanel, StatsGrid } from "@/components/dashboard/risk-panel";
import { PositionsTable } from "@/components/dashboard/positions-table";
import { TradedPairs, TradesFeed } from "@/components/dashboard/activity-feed";
import { useAccount } from "@/components/account-context";
import { kpisFor } from "@/lib/data";

export function Dashboard() {
  const { account } = useAccount();

  return (
    <>
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {kpisFor(account).map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      </section>

      <section
        aria-label="Performance"
        className="grid grid-cols-1 gap-5 xl:grid-cols-3"
      >
        <div className="min-w-0 xl:col-span-2">
          <EquityChart account={account} />
        </div>
        <RiskPanel account={account} />
      </section>

      <section
        aria-label="Positions, statistics and closed trades"
        className="grid grid-cols-1 gap-5 xl:grid-cols-3"
      >
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <PositionsTable account={account} />
          <StatsGrid account={account} />
        </div>
        <div className="min-w-0 space-y-5">
          <TradedPairs account={account} />
          <TradesFeed account={account} />
        </div>
      </section>
    </>
  );
}
