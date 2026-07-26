"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FilterX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccount } from "@/components/account-context";
import {
  accountTrades,
  applyFilter,
  balanceBefore,
  EMPTY_FILTER,
  type TradeFilter,
} from "@/lib/account-analytics";
import { SummaryCalendar } from "@/components/account-detail/summary-calendar";
import { PnlSection } from "@/components/account-detail/pnl-section";
import { AnalysisCards } from "@/components/account-detail/analysis-cards";
import { money } from "@/lib/utils";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function AccountDetail({ id }: { id: string }) {
  const { accounts } = useAccount();
  const account = accounts.find((a) => a.id === id);

  const allTrades = useMemo(
    () => (account ? accountTrades(account) : []),
    [account],
  );
  // Balance before every trade on the FULL sequence — per-trade return % and
  // R stay correct even when filters hide earlier trades.
  const balMap = useMemo(() => {
    if (!account) return new Map<number, number>();
    const bals = balanceBefore(account, allTrades);
    return new Map(allTrades.map((t, i) => [t.id, bals[i]]));
  }, [account, allTrades]);

  const [filter, setFilter] = useState<TradeFilter>(EMPTY_FILTER);
  const trades = useMemo(
    () => applyFilter(allTrades, filter),
    [allTrades, filter],
  );

  const symbols = useMemo(
    () => [...new Set(allTrades.map((t) => t.pair))].sort(),
    [allTrades],
  );
  const filtered = trades.length !== allTrades.length;

  if (!account) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-body font-medium text-ink">Account not found</p>
          <p className="max-w-xs text-label text-ink-muted">
            It may have been removed, or the link is from another browser —
            imported accounts live in this browser&apos;s storage.
          </p>
          <Button variant="secondary">
            <Link href="/accounts" className="flex items-center gap-2">
              <ArrowLeft className="size-4" aria-hidden />
              Back to accounts
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const start = account.startingBalance;
  const period =
    allTrades.length > 1
      ? `${allTrades[0].date.toLocaleDateString("en-US", { month: "short", year: "numeric" })} – ${allTrades[allTrades.length - 1].date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
      : "—";

  const meta: [string, string][] = [
    ["Broker", account.broker],
    ["Type", account.accountType ?? "—"],
    ["Starting balance", start != null ? money(start) : "—"],
    ["Current balance", money(account.equity)],
    ["Risk per trade", account.riskPerTrade != null ? `${account.riskPerTrade}%` : "—"],
    ["Data period", `${period} · broker time`],
  ];

  const set = (patch: Partial<TradeFilter>) =>
    setFilter((f) => ({ ...f, ...patch }));

  return (
    <>
      {/* Header */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/accounts"
              aria-label="Back to accounts"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-overlay hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <h2 className="text-display text-ink">{account.name}</h2>
            <Badge tone={account.source === "html" ? "accent" : "neutral"}>
              {account.source === "html" ? "Imported" : "Demo"}
            </Badge>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
            {meta.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-ink-muted">{k}</dt>
                <dd className="mt-0.5 truncate text-label font-medium tnum text-ink">
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          {/* Filters — every section below recomputes from these. */}
          <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line pt-4">
            <Field label="From">
              <Input
                type="date"
                value={filter.from ?? ""}
                onChange={(e) => set({ from: e.target.value || null })}
                className="w-36"
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={filter.to ?? ""}
                onChange={(e) => set({ to: e.target.value || null })}
                className="w-36"
              />
            </Field>
            <Field label="Symbol">
              <Select
                value={filter.symbol ?? ""}
                onChange={(e) => set({ symbol: e.target.value || null })}
                className="w-32"
              >
                <option value="">All</option>
                {symbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Weekday">
              <Select
                value={filter.weekday ?? ""}
                onChange={(e) =>
                  set({ weekday: e.target.value === "" ? null : +e.target.value })
                }
                className="w-28"
              >
                <option value="">All</option>
                {WD.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Entry hour">
              <Select
                value={filter.hour ?? ""}
                onChange={(e) =>
                  set({ hour: e.target.value === "" ? null : +e.target.value })
                }
                className="w-28"
              >
                <option value="">All</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Direction">
              <Select
                value={filter.direction ?? ""}
                onChange={(e) =>
                  set({
                    direction: (e.target.value || null) as TradeFilter["direction"],
                  })
                }
                className="w-28"
              >
                <option value="">All</option>
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </Select>
            </Field>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
                <FilterX aria-hidden />
                Clear · {trades.length}/{allTrades.length} trades
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {trades.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-body font-medium text-ink">
              No trades match these filters
            </p>
            <p className="max-w-sm text-label text-ink-muted">
              {allTrades.length === 0
                ? "This account has no closed trades yet — upload a statement with a closed-trades table."
                : "Every chart and metric on this page derives from the filtered trades, so there is nothing to compute. Loosen a filter to continue."}
            </p>
            {filtered && (
              <Button variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCalendar account={account} trades={trades} balMap={balMap} />
          <PnlSection account={account} trades={trades} />
          <AnalysisCards account={account} trades={trades} />
        </>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
