"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  consistency,
  drawdown,
  durationAnalysis,
  intraday,
  riskRatios,
  streaks,
  summary,
} from "@/lib/account-analytics";
import type { Account, HistTrade } from "@/lib/data";
import { cn, money } from "@/lib/utils";

function hoursFmt(h: number) {
  if (!h) return "—";
  if (h < 1 / 60) return "< 1m";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`;
}

function dayFmt(d: Date | null) {
  return d
    ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "—";
}

function Row({
  k,
  v,
  tone,
  sub,
}: {
  k: string;
  v: string;
  tone?: "profit" | "loss" | "warn";
  sub?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0 last:pb-0">
      <span className="min-w-0">
        <span className="block text-label text-ink-secondary">{k}</span>
        {sub && <span className="block text-[10.5px] text-ink-muted">{sub}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 text-label font-semibold tnum",
          tone === "profit"
            ? "text-profit"
            : tone === "loss"
              ? "text-loss"
              : tone === "warn"
                ? "text-warn"
                : "text-ink",
        )}
      >
        {v}
      </span>
    </li>
  );
}

function CardShell({
  title,
  headline,
  headlineTone,
  children,
}: {
  title: string;
  headline?: string;
  headlineTone?: "profit" | "loss" | "warn";
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <CardTitle>{title}</CardTitle>
        {headline && (
          <span
            className={cn(
              "text-body font-semibold tnum",
              headlineTone === "profit"
                ? "text-profit"
                : headlineTone === "loss"
                  ? "text-loss"
                  : headlineTone === "warn"
                    ? "text-warn"
                    : "text-ink",
            )}
          >
            {headline}
          </span>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AnalysisCards({
  account,
  trades,
}: {
  account: Account;
  trades: HistTrade[];
}) {
  const dur = useMemo(() => durationAnalysis(trades), [trades]);
  const intra = useMemo(() => intraday(trades), [trades]);
  const str = useMemo(() => streaks(trades), [trades]);
  const dd = useMemo(() => drawdown(account, trades), [account, trades]);
  const s = useMemo(() => summary(trades), [trades]);
  const cons = useMemo(() => consistency(trades), [trades]);
  const ratios = useMemo(() => riskRatios(account, trades), [account, trades]);

  const hourPnlMax = Math.max(...intra.hours.map((h) => Math.abs(h.pnl)), 1);

  return (
    <section
      aria-label="Detailed analysis"
      className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
    >
      {/* 1 — Duration */}
      <CardShell title="Duration analysis">
        <ul>
          <Row k="Most common" v={dur.mostCommon ? `${dur.mostCommon.label} (${dur.mostCommon.n})` : "—"} />
          <Row
            k="Most profitable"
            v={dur.mostProfitable ? `${dur.mostProfitable.label} · ${money(Math.round(dur.mostProfitable.pnl), { signed: true })}` : "—"}
            tone="profit"
          />
          <Row
            k="Least profitable"
            v={dur.leastProfitable ? `${dur.leastProfitable.label} · ${money(Math.round(dur.leastProfitable.pnl), { signed: true })}` : "—"}
            tone={dur.leastProfitable && dur.leastProfitable.pnl < 0 ? "loss" : undefined}
          />
          <Row
            k="Highest win rate"
            v={
              dur.highestWinRate
                ? `${dur.highestWinRate.label} · ${Math.round((dur.highestWinRate.wins / (dur.highestWinRate.decided || 1)) * 100)}%`
                : "—"
            }
            sub="buckets with ≥ 3 decided trades"
          />
          <Row k="Avg holding time" v={hoursFmt(dur.avgHoldingHours)} />
        </ul>
      </CardShell>

      {/* 2 — Intraday */}
      <CardShell title="Intraday activity">
        <div
          className="flex h-10 items-end gap-px"
          role="img"
          aria-label="P&L per entry hour"
        >
          {intra.hours.map((h) => (
            <span
              key={h.h}
              title={`${String(h.h).padStart(2, "0")}:00 — ${money(Math.round(h.pnl), { signed: true })}, ${h.n} trades, ${h.decided ? Math.round((h.wins / h.decided) * 100) : 0}% win`}
              className="min-w-0 flex-1 rounded-t-xs"
              style={{
                height: `${Math.max(8, (Math.abs(h.pnl) / hourPnlMax) * 100)}%`,
                background: `var(--color-${h.pnl >= 0 ? "profit" : "loss"})`,
                opacity: 0.65,
              }}
            />
          ))}
        </div>
        <p className="mt-1 text-[10.5px] text-ink-muted">
          Entry hour, broker time · hover a bar for its stats
        </p>
        <ul className="mt-2">
          <Row
            k="Best hour"
            v={intra.best ? `${String(intra.best.h).padStart(2, "0")}:00 · ${money(Math.round(intra.best.pnl), { signed: true })}` : "—"}
            tone="profit"
          />
          <Row
            k="Worst hour"
            v={intra.worst ? `${String(intra.worst.h).padStart(2, "0")}:00 · ${money(Math.round(intra.worst.pnl), { signed: true })}` : "—"}
            tone={intra.worst && intra.worst.pnl < 0 ? "loss" : undefined}
          />
          <Row
            k="Busiest hour"
            v={intra.busiest ? `${String(intra.busiest.h).padStart(2, "0")}:00 · ${intra.busiest.n} trades` : "—"}
          />
        </ul>
      </CardShell>

      {/* 3 — Streaks */}
      <CardShell title="Streak analysis">
        <ul>
          <Row
            k="Longest win streak"
            v={`${str.longestWin.len} · ${money(Math.round(str.longestWin.pnl), { signed: true })}`}
            tone="profit"
          />
          <Row
            k="Longest loss streak"
            v={`${str.longestLoss.len} · ${money(Math.round(str.longestLoss.pnl), { signed: true })}`}
            tone="loss"
          />
          <Row
            k="Current streak"
            v={
              str.current.len
                ? `${str.current.len} ${str.current.isWin ? "wins" : "losses"} · ${money(Math.round(str.current.pnl), { signed: true })}`
                : "—"
            }
            tone={str.current.len ? (str.current.isWin ? "profit" : "loss") : undefined}
          />
          <Row k="Avg win streak" v={str.avgWinStreak.toFixed(1)} />
          <Row k="Avg loss streak" v={str.avgLossStreak.toFixed(1)} />
        </ul>
      </CardShell>

      {/* 4 — Drawdown */}
      <CardShell
        title="Drawdown"
        headline={dd.currentAbs > 0 ? `−${money(Math.round(dd.currentAbs))}` : "At peak"}
        headlineTone={dd.currentAbs > 0 ? "loss" : "profit"}
      >
        <ul>
          <Row
            k="Max drawdown"
            v={`−${money(Math.round(dd.maxAbs))} (${dd.maxPct.toFixed(1)}%)`}
            tone="loss"
            sub="previous equity high → subsequent trough"
          />
          <Row k="Peak" v={`${money(Math.round(dd.episode.peak))} · ${dayFmt(dd.episode.peakDate)}`} />
          <Row k="Trough" v={`${money(Math.round(dd.episode.trough))} · ${dayFmt(dd.episode.troughDate)}`} />
          <Row
            k="Recovered"
            v={dd.episode.recoveredDate ? dayFmt(dd.episode.recoveredDate) : "Not yet"}
            tone={dd.episode.recoveredDate ? undefined : "warn"}
          />
          <Row k="Trades underwater" v={String(dd.episode.tradesUnderwater)} />
          <Row k="Max days underwater" v={`${dd.maxUnderwaterDays} days`} />
        </ul>
      </CardShell>

      {/* 5 — Recovery factor */}
      <CardShell
        title="Recovery factor"
        headline={dd.maxAbs > 0 ? (s.netPnl / dd.maxAbs).toFixed(2) : "—"}
      >
        <ul>
          <Row
            k="Net profit"
            v={money(Math.round(s.netPnl), { signed: true })}
            tone={s.netPnl >= 0 ? "profit" : "loss"}
          />
          <Row k="Max drawdown" v={`−${money(Math.round(dd.maxAbs))}`} tone="loss" />
          <Row
            k="Status"
            v={
              dd.maxAbs === 0
                ? "No drawdown yet"
                : dd.currentAbs === 0
                  ? "Fully recovered"
                  : `Recovering · −${money(Math.round(dd.currentAbs))} to go`
            }
            tone={dd.currentAbs === 0 ? "profit" : "warn"}
          />
        </ul>
        <p className="mt-3 text-[10.5px] text-ink-muted">
          Net profit ÷ max drawdown. Higher means losses are re-earned faster.
        </p>
      </CardShell>

      {/* 6 — Consistency */}
      <CardShell
        title="Consistency"
        headline={cons.score !== null ? `${cons.score}` : "—"}
        headlineTone={
          cons.score === null
            ? undefined
            : cons.score >= 60
              ? "profit"
              : cons.score >= 40
                ? "warn"
                : "loss"
        }
      >
        {cons.score !== null ? (
          <>
            <Progress
              value={cons.score}
              tone={cons.score >= 60 ? "profit" : cons.score >= 40 ? "warn" : "loss"}
              label="Consistency score"
            />
            <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-muted">
              <span>Volatile</span>
              <span>Highly consistent</span>
            </div>
            <ul className="mt-3">
              <Row k="Rating" v={cons.label} />
              <Row
                k="Largest day share of profit"
                v={`${cons.topDaySharePct}%`}
                tone={(cons.topDaySharePct ?? 0) > 40 ? "warn" : undefined}
              />
              <Row k="Profitable days" v={`${cons.profitableDaysPct}%`} />
            </ul>
          </>
        ) : (
          <p className="text-label text-ink-muted">
            Needs at least 5 trades to score.
          </p>
        )}
      </CardShell>

      {/* 7 — Sharpe */}
      <CardShell
        title="Sharpe ratio"
        headline={ratios.sharpe != null ? ratios.sharpe.toFixed(2) : "—"}
        headlineTone={
          ratios.sharpe == null ? undefined : ratios.sharpe >= 1 ? "profit" : "warn"
        }
      >
        <ul>
          <Row k="Rating" v={ratios.sharpeRating} />
          <Row k="Avg return" v={`${ratios.meanPct >= 0 ? "+" : "−"}${Math.abs(ratios.meanPct).toFixed(2)}%`} />
          <Row k="Volatility" v={`${ratios.volPct.toFixed(2)}%`} />
          <Row k="Observations" v={String(ratios.n)} />
          <Row k="Risk-free rate" v={`${ratios.riskFree}%`} />
        </ul>
        <p className="mt-3 text-[10.5px] text-ink-muted">
          Computed on {ratios.frequency}.
        </p>
      </CardShell>

      {/* 8 — Sortino */}
      <CardShell
        title="Sortino ratio"
        headline={ratios.sortino != null ? ratios.sortino.toFixed(2) : "—"}
        headlineTone={
          ratios.sortino == null ? undefined : ratios.sortino >= 1 ? "profit" : "warn"
        }
      >
        <ul>
          <Row k="Rating" v={ratios.sortinoRating} />
          <Row k="Avg return" v={`${ratios.meanPct >= 0 ? "+" : "−"}${Math.abs(ratios.meanPct).toFixed(2)}%`} />
          <Row k="Downside deviation" v={`${ratios.downsidePct.toFixed(2)}%`} sub="only negative returns count" />
          <Row k="Observations" v={String(ratios.n)} />
          <Row k="Min acceptable return" v={`${ratios.mar}%`} />
        </ul>
        <p className="mt-3 text-[10.5px] text-ink-muted">
          Computed on {ratios.frequency}.
        </p>
      </CardShell>
    </section>
  );
}
