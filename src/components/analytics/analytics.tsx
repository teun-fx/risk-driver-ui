"use client";

import { useState } from "react";
import { ArrowLeftRight, LayoutGrid, ShieldAlert, Shuffle } from "lucide-react";
import { EquityChart } from "@/components/dashboard/equity-chart";
import { MonthlyReturns } from "@/components/dashboard/monthly-returns";
import { TradeOutcomes } from "@/components/analytics/trade-outcomes";
import { ReturnStatistics } from "@/components/analytics/return-statistics";
import { RiskTab } from "@/components/analytics/risk-tab";
import { MonteCarloTab } from "@/components/analytics/monte-carlo";
import { TradesTab } from "@/components/analytics/trades-tab";
import { useAccount } from "@/components/account-context";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "risk", label: "Risk stats", icon: ShieldAlert },
  { id: "montecarlo", label: "Monte Carlo", icon: Shuffle },
  { id: "trades", label: "Trades", icon: ArrowLeftRight },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * The reference's pill navigation, translated to the app's tokens: quiet
 * ghost items, the active one lifted onto the overlay surface with a hairline.
 */
function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <div role="tablist" aria-label="Analytics sections" className="flex items-center gap-1.5">
      {TABS.map((t) => {
        const Icon = t.icon;
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full px-4 text-label font-medium",
              "transition-colors duration-150 ease-out",
              selected
                ? "border border-line bg-overlay text-ink shadow-pop"
                : "border border-transparent text-ink-muted hover:bg-raised hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Analytics() {
  const { account } = useAccount();
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <>
      <TabBar active={tab} onChange={setTab} />

      {tab === "overview" && (
        <>
          <section aria-label="Equity curve">
            <EquityChart account={account} height={360} />
          </section>

          <section aria-label="Monthly returns">
            <MonthlyReturns account={account} />
          </section>

          <section
            aria-label="Outcomes and statistics"
            className="grid grid-cols-1 gap-5 xl:grid-cols-3"
          >
            <div className="min-w-0 xl:col-span-2">
              <ReturnStatistics account={account} />
            </div>
            <TradeOutcomes account={account} />
          </section>
        </>
      )}

      {tab === "risk" && <RiskTab account={account} />}

      {tab === "montecarlo" && <MonteCarloTab account={account} />}

      {tab === "trades" && <TradesTab account={account} />}
    </>
  );
}
