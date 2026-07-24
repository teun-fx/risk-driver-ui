"use client";

import { useState } from "react";
import { EquityChart } from "@/components/dashboard/equity-chart";
import { MonthlyReturns } from "@/components/dashboard/monthly-returns";
import { UnderwaterPlot } from "@/components/analytics/underwater-plot";
import { TradeOutcomes } from "@/components/analytics/trade-outcomes";
import { ReturnStatistics } from "@/components/analytics/return-statistics";
import { useAccount } from "@/components/account-context";
import type { Range } from "@/lib/data";

export function Analytics() {
  const { account } = useAccount();

  // The underwater plot follows the equity curve's range so the two read as
  // one analysis. Imports default to the full history (they span years).
  const [range, setRange] = useState<Range>(
    account.source === "html" ? "Max" : "3M",
  );

  return (
    <>
      <section aria-label="Equity curve">
        <EquityChart account={account} height={360} onRangeChange={setRange} />
      </section>

      <section aria-label="Monthly returns">
        <MonthlyReturns account={account} />
      </section>

      <section
        aria-label="Drawdown and trade outcomes"
        className="grid grid-cols-1 gap-5 xl:grid-cols-3"
      >
        <div className="min-w-0 xl:col-span-2">
          <UnderwaterPlot account={account} range={range} height={330} />
        </div>
        <TradeOutcomes account={account} />
      </section>

      <section aria-label="Return statistics">
        <ReturnStatistics account={account} />
      </section>
    </>
  );
}
