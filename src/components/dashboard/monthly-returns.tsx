"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { useAccount } from "@/components/account-context";
import { withJournalBasis } from "@/lib/parse-statement";
import {
  MONTHS,
  monthlyReturns,
  monthlyStats,
  type Account,
  type MonthCell,
} from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Analytics-table style (the reference's Wide Inline Analytics Table):
 * balanced spacing, hairline row dividers, and plain figures — positive
 * months in the app's profit green, negative in loss red, no magnitude bars.
 *
 * Hovering a month raises a tooltip with that month's return and its
 * intra-month max drawdown. Pure CSS (group-hover), so the component stays a
 * server component and keyboard focus (tabIndex) triggers it too.
 */

function sign(v: number) {
  return v > 0 ? "+" : v < 0 ? "−" : "";
}

function Cell({
  cell,
  month,
  year,
  flip = false,
}: {
  cell: MonthCell | null;
  month: string;
  year: number;
  /** Render the tooltip below the cell. The scroll wrapper's overflow-x:auto
      forces overflow-y to auto as well, so a tooltip opening upward from the
      top row would be clipped — the first row flips downward instead. */
  flip?: boolean;
}) {
  if (cell === null) {
    return (
      <div className="flex h-9 items-center justify-center">
        <span className="text-[12.5px] text-ink-muted/45" aria-hidden>
          –
        </span>
        <span className="sr-only">No data yet</span>
      </div>
    );
  }

  const up = cell.ret >= 0;

  return (
    <div
      tabIndex={0}
      className="group relative flex h-9 items-center justify-end rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Same P&L inks as the rest of the app: profit green / loss red. */}
      <span
        className={cn(
          "text-[12.5px] font-medium tnum",
          up ? "text-profit" : "text-loss",
        )}
      >
        {sign(cell.ret)}
        {Math.abs(cell.ret).toFixed(1)}
      </span>

      {/* Tooltip — same surface as the chart tooltips. */}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute left-1/2 z-30 -translate-x-1/2",
          flip ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
          "w-[168px] rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop",
          "opacity-0 transition-opacity duration-150 ease-out",
          "group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100",
        )}
      >
        <p className="text-label text-ink-muted">
          {month} {year}
        </p>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label text-ink-secondary">Return</span>
            <span
              className={cn(
                "text-label tnum font-medium",
                up ? "text-profit" : "text-loss",
              )}
            >
              {sign(cell.ret)}
              {Math.abs(cell.ret).toFixed(2)}%
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label text-ink-secondary">Drawdown</span>
            <span className="text-label tnum font-medium text-loss">
              −{Math.abs(cell.dd).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonthlyReturns({ account }: { account: Account }) {
  const { updateAccount } = useAccount();
  const rows = monthlyReturns(account);

  const stats = monthlyStats(account);
  // Journal accounts on the fixed basis don't compound anywhere — their
  // headline is the plain sum of the yearly totals, labeled honestly.
  const fixed = account.journal && account.basis === "fixed";
  // Imported accounts: headline straight from equity. Compounding the table's
  // ROUNDED cells drifts (145 months × ±0.005 showed 2309.9 vs a true 2310.4)
  // and must always equal the equity curve's own gain figure.
  const start = account.startingBalance ?? 0;
  const cumulative =
    account.source === "html" && start > 0
      ? ((account.equity - start) / start) * 100
      : fixed
        ? rows.reduce((acc, r) => acc + r.total, 0)
        : (rows.reduce((acc, r) => acc * (1 + r.total / 100), 1) - 1) * 100;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Monthly returns</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-metric text-ink">
              {sign(cumulative)}
              {Math.abs(cumulative).toFixed(1)}%
            </span>
            <span className="text-label text-ink-muted">
              {fixed
                ? `of starting balance since ${account.since}`
                : `compounded since ${account.since}`}
            </span>
          </div>
        </div>

        {/* Journal accounts: the same layer switch as the equity curve.
            Off = fixed % of the starting balance, on = compounded. It flips
            the account's basis, so every other view follows too. */}
        {account.journal && (
          <div className="shrink-0">
            <Toggle
              label="Compounding"
              checked={(account.basis ?? "compounded") === "compounded"}
              onChange={(v) =>
                updateAccount({
                  ...withJournalBasis(account, v ? "compounded" : "fixed"),
                  updatedAt: new Date().toISOString(),
                })
              }
            />
          </div>
        )}
      </CardHeader>

      {/* Grid and derived stats sit side by side inside the one card, so the
          slack the Total column used to hoard now carries information. */}
      <div className="flex min-w-0 flex-col gap-4 pb-3 xl:flex-row">
      {/* No overflow-hidden here — the tooltip must escape the table box.
          The wrapper still scrolls horizontally on narrow screens. */}
      <div className="min-w-0 flex-1 overflow-x-auto px-1">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Percentage return by month and year with intra-month max drawdown,
            and a compounded annual total
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface py-2 pr-3 pl-4 text-left text-[11px] font-normal text-ink-muted"
              >
                <span className="sr-only">Year</span>
              </th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="px-2 py-2 text-right text-[11px] font-normal text-ink-muted"
                >
                  {m}
                </th>
              ))}
              <th
                scope="col"
                className="border-l border-grid py-2 pr-4 pl-4 text-right text-[11px] font-normal text-ink-muted"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.year}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 w-14 border-t border-grid bg-surface py-0 pr-3 pl-4 text-left text-[12.5px] font-semibold tnum text-ink"
                >
                  {row.year}
                </th>

                {row.months.map((cell, i) => (
                  <td key={i} className="border-t border-grid px-2 py-0.5 text-right">
                    <Cell
                      cell={cell}
                      month={MONTHS[i]}
                      year={row.year}
                      flip={rowIndex === 0}
                    />
                  </td>
                ))}

                <td className="border-t border-l border-grid py-0 pr-4 pl-4 text-right">
                  <span
                    className={cn(
                      "text-[12.5px] font-semibold tnum",
                      row.total >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {sign(row.total)}
                    {Math.abs(row.total).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

        <div className="shrink-0 px-5 xl:w-72 xl:border-l xl:border-line xl:px-5">
          {/* Same box as a column header, so the panel titles align with
              Jan–Dec and each stat row lands level with a table row. */}
          <p className="py-2 text-[11px] text-ink-muted">Highlights</p>
          <dl className="grid grid-cols-2 gap-x-5">
            <Stat
              label="Best month"
              value={stats.bestMonth?.value}
              meta={stats.bestMonth?.label}
            />
            <Stat
              label="Worst month"
              value={stats.worstMonth?.value}
              meta={stats.worstMonth?.label}
            />
            <Stat
              label="Best year"
              value={stats.bestYear?.value}
              meta={stats.bestYear?.label}
            />
            <Stat
              label="Worst year"
              value={stats.worstYear?.value}
              meta={stats.worstYear?.label}
            />
            <Stat
              label="Longest win run"
              plain={`${stats.longestWinRun} ${stats.longestWinRun === 1 ? "month" : "months"}`}
            />
            <Stat
              label="Longest loss run"
              plain={`${stats.longestLossRun} ${stats.longestLossRun === 1 ? "month" : "months"}`}
            />
            <Stat label="Average month" value={stats.avgMonth} />
            <Stat label="Average year" value={stats.avgYear} />
          </dl>
        </div>
      </div>

      <p className="px-5 pt-2 pb-4 text-[11.5px] text-ink-muted">
        Percentage returns. Hover a month for its return and max drawdown.
        Annual totals are compounded, not summed.
      </p>
    </Card>
  );
}

/**
 * One highlight: label above, figure below — all figures in plain ink, the
 * +/− sign carrying direction.
 */
function Stat({
  label,
  value,
  meta,
  plain,
}: {
  label: string;
  value?: number;
  meta?: string;
  plain?: string;
}) {
  return (
    // h-[41px] = exactly one table row, so Best month sits on the 2026 line,
    // Best year on 2025, and so on straight down the grid.
    <div className="flex h-[41px] min-w-0 flex-col justify-center border-t border-grid">
      <dt className="text-[10.5px] leading-3 text-ink-muted">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        {plain !== undefined ? (
          <span className="text-[14px] leading-5 font-semibold tnum text-ink">{plain}</span>
        ) : (
          /* Plain ink — the grid already carries the green/red; the panel
             stays quiet and lets the signs speak. */
          <span className="text-[14px] leading-5 font-semibold tnum text-ink">
            {sign(value ?? 0)}
            {Math.abs(value ?? 0).toFixed(1)}%
          </span>
        )}
        {meta && (
          <span className="truncate text-[11px] tnum text-ink-muted">
            {meta}
          </span>
        )}
      </dd>
    </div>
  );
}
