"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { calendarDays, rMultiple, summary } from "@/lib/account-analytics";
import type { Account, HistTrade } from "@/lib/data";
import { cn, money } from "@/lib/utils";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function kfmt(v: number) {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "+";
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(a)}`;
}

function hours(h: number) {
  if (!h) return "—";
  return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`;
}

function timeOf(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SummaryCalendar({
  account,
  trades,
  balMap,
}: {
  account: Account;
  trades: HistTrade[];
  balMap: Map<number, number>;
}) {
  const s = useMemo(() => summary(trades), [trades]);
  const days = useMemo(() => calendarDays(trades), [trades]);

  // Default to the last month that actually has trades.
  const lastTrade = trades[trades.length - 1];
  const [ym, setYm] = useState<{ y: number; m: number }>(() => {
    const d = lastTrade?.date ?? new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [openDay, setOpenDay] = useState<string | null>(null);

  const nav = (delta: number) => {
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  // Monday-first calendar grid for the visible month.
  const grid = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const lead = (first.getDay() + 6) % 7; // Mon = 0
    const count = new Date(ym.y, ym.m + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) => i + 1),
    ];
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [ym]);

  const keyOf = (day: number) =>
    `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const monthMax = useMemo(() => {
    let m = 0;
    for (const [k, d] of days) {
      if (k.startsWith(`${ym.y}-${String(ym.m + 1).padStart(2, "0")}`))
        m = Math.max(m, Math.abs(d.pnl));
    }
    return m || 1;
  }, [days, ym]);

  const openTrades = openDay ? (days.get(openDay)?.trades ?? []) : [];

  const rows: [string, string, ("profit" | "loss" | undefined)?][] = [
    ["Total trades", String(s.total)],
    ["Winning trades", String(s.wins), "profit"],
    ["Losing trades", String(s.losses), "loss"],
    ["Break-even trades", String(s.breakEven)],
    ["Net P&L", money(Math.round(s.netPnl), { signed: true }), s.netPnl >= 0 ? "profit" : "loss"],
    ["Gross profit", money(Math.round(s.grossProfit)), "profit"],
    ["Gross loss", money(Math.round(s.grossLoss)), "loss"],
    [
      "Total commissions",
      s.commissions !== null ? money(Math.round(s.commissions)) : "—",
    ],
    ["Total swaps", s.swaps !== null ? money(Math.round(s.swaps)) : "—"],
    ["Largest win", money(Math.round(s.largestWin), { signed: true }), "profit"],
    ["Largest loss", money(Math.round(s.largestLoss), { signed: true }), "loss"],
    ["Average win", money(Math.round(s.avgWin)), "profit"],
    ["Average loss", money(Math.round(s.avgLoss)), "loss"],
    ["Avg holding time", hours(s.avgHoldingHours)],
    ["Avg trades / trading day", s.avgTradesPerDay.toFixed(1)],
    ["Most active weekday", s.mostActiveWeekday ?? "—"],
    ["Most profitable weekday", s.mostProfitableWeekday ?? "—"],
    ["Least profitable weekday", s.leastProfitableWeekday ?? "—"],
  ];

  return (
    <section
      aria-label="Summary and calendar"
      className="grid grid-cols-1 gap-5 xl:grid-cols-5"
    >
      {/* Left: summary table */}
      <Card className="min-w-0 xl:col-span-2">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          {s.commissions === null && (
            <span className="text-label text-ink-muted">
              Costs need a re-uploaded statement
            </span>
          )}
        </CardHeader>
        <CardContent>
          <ul>
            {rows.map(([label, value, tone]) => (
              <li
                key={label}
                className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0 last:pb-0"
              >
                <span className="text-label text-ink-secondary">{label}</span>
                <span
                  className={cn(
                    "text-label font-semibold tnum",
                    tone === "profit"
                      ? "text-profit"
                      : tone === "loss"
                        ? "text-loss"
                        : "text-ink",
                  )}
                >
                  {value}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Right: calendar */}
      <Card className="min-w-0 xl:col-span-3">
        <CardHeader className="items-center">
          <CardTitle>Trading calendar</CardTitle>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => nav(-1)}
              aria-label="Previous month"
              className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-overlay hover:text-ink"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="w-36 text-center text-label font-medium text-ink">
              {MONTH_NAMES[ym.m]} {ym.y}
            </span>
            <button
              type="button"
              onClick={() => nav(1)}
              aria-label="Next month"
              className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-overlay hover:text-ink"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span
                key={d}
                className="pb-1 text-center text-[11px] text-ink-muted"
              >
                {d}
              </span>
            ))}
            {grid.map((day, i) => {
              if (day === null) return <span key={`e${i}`} />;
              const k = keyOf(day);
              const d = days.get(k);
              const has = !!d && d.trades.length > 0;
              const pos = (d?.pnl ?? 0) >= 0;
              const strength = d ? 0.25 + 0.55 * (Math.abs(d.pnl) / monthMax) : 0;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!has}
                  onClick={() => setOpenDay(k)}
                  aria-label={
                    has
                      ? `${k}: ${money(Math.round(d.pnl), { signed: true })}, ${d.trades.length} trades`
                      : `${k}: no trades`
                  }
                  className={cn(
                    "flex h-[72px] flex-col rounded-md border p-1.5 text-left transition-colors duration-150 ease-out",
                    has
                      ? "cursor-pointer border-transparent hover:border-line-strong"
                      : "border-line/50 bg-transparent",
                  )}
                  style={
                    has
                      ? {
                          background: `color-mix(in oklab, var(--color-${pos ? "profit" : "loss"}) ${Math.round(strength * 22)}%, var(--color-raised))`,
                        }
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "text-[11px] tnum",
                      has ? "text-ink-secondary" : "text-ink-muted/60",
                    )}
                  >
                    {day}
                  </span>
                  {has && (
                    <span className="mt-auto">
                      <span
                        className={cn(
                          "block text-[12px] leading-4 font-semibold tnum",
                          pos ? "text-profit" : "text-loss",
                        )}
                      >
                        {kfmt(d.pnl)}
                      </span>
                      <span className="block text-[10.5px] text-ink-muted">
                        {d.trades.length} trade{d.trades.length > 1 ? "s" : ""}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-label text-ink-muted">
            <LegendDot colorVar="--color-profit" label="Positive day" />
            <LegendDot colorVar="--color-loss" label="Negative day" />
            <span>Blank = no trades · click a day for its trades</span>
          </div>
        </CardContent>
      </Card>

      {/* Day drawer */}
      <Dialog
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        title={
          openDay
            ? new Date(openDay).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : ""
        }
        description={
          openDay
            ? `${openTrades.length} trades · ${money(
                Math.round(openTrades.reduce((a, t) => a + t.pnl, 0)),
                { signed: true },
              )} net`
            : undefined
        }
        className="max-w-2xl"
      >
        <div className="max-h-[60vh] overflow-y-auto">
          <ul className="space-y-3">
            {openTrades.map((t) => {
              const bal = balMap.get(t.id);
              const retPct = bal ? (t.pnl / bal) * 100 : null;
              const r = bal != null ? rMultiple(account, t, bal) : null;
              const entry = new Date(t.date.getTime() - t.durationHours * 3_600_000);
              return (
                <li
                  key={t.id}
                  className="rounded-md border border-line bg-raised px-4 py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-body font-semibold tnum text-ink">
                      {t.pair}
                    </span>
                    <Badge tone={t.side === "Long" ? "accent" : "neutral"}>
                      {t.side}
                    </Badge>
                    <span className="ml-auto text-body font-semibold tnum">
                      <span className={t.pnl >= 0 ? "text-profit" : "text-loss"}>
                        {money(t.pnl, { signed: true })}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                    <Meta
                      k="Entry → exit"
                      v={`${
                        entry.toDateString() !== t.date.toDateString()
                          ? `${entry.toLocaleDateString("en-US", { month: "short", day: "numeric" })} `
                          : ""
                      }${timeOf(entry)} → ${timeOf(t.date)}`}
                    />
                    <Meta k="Held" v={hours(t.durationHours)} />
                    <Meta k="Size" v={t.lots != null ? `${t.lots} lots` : "—"} />
                    <Meta
                      k="Return"
                      v={retPct != null ? `${retPct >= 0 ? "+" : "−"}${Math.abs(retPct).toFixed(2)}%` : "—"}
                    />
                    <Meta k="R" v={r != null ? `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}R` : "—"} />
                    <Meta
                      k="Commission"
                      v={t.commission != null ? money(t.commission) : "—"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Dialog>
    </section>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2 sm:block">
      <span className="text-[11px] text-ink-muted">{k}</span>
      <span className="block text-label tnum text-ink-secondary">{v}</span>
    </span>
  );
}

function LegendDot({ colorVar, label }: { colorVar: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2 rounded-xs"
        style={{ background: `var(${colorVar})`, opacity: 0.7 }}
        aria-hidden
      />
      {label}
    </span>
  );
}
