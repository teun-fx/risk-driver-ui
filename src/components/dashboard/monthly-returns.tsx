import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { MONTHS, monthlyReturns, type Account, type MonthCell } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Analytics-table style (the reference's Wide Inline Analytics Table):
 * balanced spacing, hairline row dividers, and plain figures — positive
 * months in white ink, negative in red, no magnitude bars.
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
      <div className="flex h-12 flex-col items-center justify-center">
        <span className="text-ink-muted/35" aria-hidden>
          ·
        </span>
        <span className="sr-only">No data</span>
      </div>
    );
  }

  const up = cell.ret >= 0;

  return (
    <div
      tabIndex={0}
      className="group relative flex h-12 items-center justify-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Reference style: positive months in plain ink, negative in red. */}
      <span
        className={cn(
          "text-[12.5px] font-medium tnum",
          up ? "text-ink" : "text-loss",
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
  const rows = monthlyReturns(account);

  const cumulative =
    (rows.reduce((acc, r) => acc * (1 + r.total / 100), 1) - 1) * 100;
  const best = Math.max(...rows.map((r) => r.total));
  const worst = Math.min(...rows.map((r) => r.total));

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
              compounded since {account.since}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <Extreme label="Best year" value={best} />
          <Extreme label="Worst year" value={worst} />
        </div>
      </CardHeader>

      {/* No overflow-hidden here — the tooltip must escape the table box.
          The wrapper still scrolls horizontally on narrow screens. */}
      {/* pb-3, not pb-1: the top row's flipped tooltip reaches ~4px past the
          last row on a 3-year account, and overflow-x:auto clips it there. */}
      <div className="min-w-0 overflow-x-auto px-1 pb-3">
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
                Year
              </th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="px-1 py-2 text-center text-[11px] font-normal text-ink-muted"
                >
                  {m}
                </th>
              ))}
              <th
                scope="col"
                className="py-2 pr-4 pl-4 text-right text-[11px] font-normal text-ink-muted"
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
                  className="sticky left-0 z-10 border-t border-grid bg-surface py-0 pr-3 pl-4 text-left text-[12.5px] font-semibold tnum text-ink"
                >
                  {row.year}
                </th>

                {row.months.map((cell, i) => (
                  <td key={i} className="border-t border-grid p-0.5 text-center">
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
                      row.total >= 0 ? "text-ink" : "text-loss",
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

      <p className="px-5 pt-2 pb-4 text-[11.5px] text-ink-muted">
        Percentage returns. Hover a month for its return and max drawdown.
        Annual totals are compounded, not summed.
      </p>
    </Card>
  );
}

function Extreme({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-body font-semibold tnum",
          value >= 0 ? "text-ink" : "text-loss",
        )}
      >
        {sign(value)}
        {Math.abs(value).toFixed(1)}%
      </p>
    </div>
  );
}
