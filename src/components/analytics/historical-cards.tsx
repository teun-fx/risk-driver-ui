"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/input";
import type {
  ContinuationAnalysis,
  HistoricalPosition,
  RecoveryCurve,
} from "@/lib/historical-analysis";
import { MODEL_LABELS, type McModel } from "@/lib/monte-carlo";
import { cn } from "@/lib/utils";

/** 1st, 2nd, 3rd, 4th… — "1th" reads like a bug even when the maths is right. */
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const pctFmt = (v: number | null, dp = 1) =>
  v === null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`;
const plainPct = (v: number | null, dp = 0) =>
  v === null ? "—" : `${v.toFixed(dp)}%`;

/** Percentile → position on a 0–100 scale, drawn as a marker on a track. */
function PositionScale({ percentile }: { percentile: number }) {
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-full bg-raised">
        {/* Middle 50% of the historical distribution, for reference. */}
        <span
          className="absolute inset-y-0 rounded-full bg-line-strong/60"
          style={{ left: "25%", width: "50%" }}
          aria-hidden
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent"
          style={{ left: `${Math.min(100, Math.max(0, percentile))}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-muted">
        <span>Weakest historical window</span>
        <span>Strongest</span>
      </div>
    </div>
  );
}

export function HistoricalPositionCard({
  position,
  windowLabel,
  onWindowChange,
  windowOptions,
}: {
  position: HistoricalPosition | null;
  windowLabel: string;
  onWindowChange: (w: string) => void;
  windowOptions: readonly string[];
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Historical position</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            Where the current window sits inside this strategy&apos;s own
            distribution
          </p>
        </div>
        <SegmentedControl
          options={windowOptions}
          value={windowLabel}
          onChange={onWindowChange}
          ariaLabel="Rolling window"
        />
      </CardHeader>

      <CardContent>
        {!position ? (
          <p className="py-6 text-center text-label text-ink-muted">
            Not enough trade history to build comparable rolling windows at this
            size. Choose a smaller window, or import a longer statement.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-display text-ink">
                {position.outsideRange
                  ? "Outside range"
                  : `${position.band === "Bottom 10%" || position.percentile < 50 ? "Bottom" : "Top"} ${position.percentile < 50 ? position.percentile : 100 - position.percentile}%`}
              </span>
              <span className="text-label text-ink-secondary">
                {position.band}
              </span>
            </div>

            <PositionScale percentile={position.percentile} />

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Stat
                k="Historical percentile"
                v={ordinal(position.percentile)}
              />
              <Stat
                k="Window return"
                v={pctFmt(position.current.returnPct, 2)}
                tone={position.current.returnPct >= 0 ? "profit" : "loss"}
              />
              <Stat
                k="Comparable windows"
                v={position.comparisons.length.toLocaleString("en-US")}
                sub={`${position.independentCount} non-overlapping`}
              />
              <Stat k="Active window" v={plural(position.windowSize, "trade")} />
            </dl>

            <p className="mt-4 text-[11.5px] text-ink-muted">
              Rolling windows overlap by design — consecutive windows share all
              but one trade, so the count above is not a count of independent
              observations.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "profit" | "loss";
}) {
  return (
    <div>
      <dt className="text-[11px] text-ink-muted">{k}</dt>
      <dd
        className={cn(
          "mt-0.5 text-body font-semibold tnum",
          tone === "profit"
            ? "text-profit"
            : tone === "loss"
              ? "text-loss"
              : "text-ink",
        )}
      >
        {v}
      </dd>
      {sub && <dd className="text-[10.5px] text-ink-muted">{sub}</dd>}
    </div>
  );
}

export function ContinuationCard({
  cont,
  rInfo,
}: {
  cont: ContinuationAnalysis;
  rInfo: (pct: number | null) => string | null;
}) {
  const n = cont.periods.length;
  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Historical continuation</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            What actually followed the {n} most similar historical windows
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {n === 0 ? (
          <p className="py-6 text-center text-label text-ink-muted">
            No historical window has enough trades after it to observe a
            continuation yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  ["Next 25 trades", cont.avgNext25, cont.positive25Pct],
                  ["Next 50 trades", cont.avgNext50, cont.positive50Pct],
                  ["Next 100 trades", cont.avgNext100, cont.positive100Pct],
                ] as const
              ).map(([label, avg, pos]) => (
                <div
                  key={label}
                  className="rounded-md border border-line bg-raised px-4 py-3"
                >
                  <p className="text-eyebrow text-ink-muted">{label}</p>
                  <p
                    className={cn(
                      "mt-1.5 text-metric tnum",
                      (avg ?? 0) >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {pctFmt(avg, 1)}
                  </p>
                  {rInfo(avg) && (
                    <p className="text-[10.5px] tnum text-ink-muted">
                      {rInfo(avg)}
                    </p>
                  )}
                  <p className="mt-1 text-label text-ink-secondary">
                    Positive in {plainPct(pos)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Stat
                k="Exceeded window level"
                v={plainPct(cont.recoveryPct)}
                tone="profit"
              />
              <Stat
                k="Did not"
                v={plainPct(cont.deteriorationPct)}
                tone="loss"
              />
              <Stat
                k="Median trades to exceed"
                v={
                  cont.medianRecoveryTrades !== null
                    ? plural(cont.medianRecoveryTrades, "trade")
                    : "—"
                }
              />
              <Stat
                k="Avg further drawdown"
                v={pctFmt(cont.avgAdditionalDrawdownPct, 1)}
                tone="loss"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function RecoveryCurveCard({ curve }: { curve: RecoveryCurve }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Recovery curve</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            The live window against what followed similar historical windows —
            observed, not simulated
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Key colorVar="--color-accent" label="Current" />
          <Key colorVar="--color-chart-2" label="Historical average" dashed />
          <Key colorVar="--color-profit" label="Best" />
          <Key colorVar="--color-loss" label="Worst" />
        </div>
      </CardHeader>
      <div className="h-[260px] w-full min-w-0 px-1 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
              dy={6}
              label={{
                value: "Trades after window start",
                position: "insideBottom",
                offset: -2,
                fill: "var(--color-ink-muted)",
                fontSize: 10.5,
              }}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as RecoveryCurve[number];
                return (
                  <div className="rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop">
                    <p className="text-label text-ink-muted">
                      Trade {label} after start
                    </p>
                    <div className="mt-1.5 space-y-1 text-label tnum">
                      <p className="text-accent">Current {pctFmt(d.current, 2)}</p>
                      <p className="text-ink-secondary">
                        Historical avg {pctFmt(d.average, 2)}
                      </p>
                      <p className="text-profit">Best {pctFmt(d.best, 2)}</p>
                      <p className="text-loss">Worst {pctFmt(d.worst, 2)}</p>
                    </div>
                  </div>
                );
              }}
              cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            />
            <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />
            <Line dataKey="best" stroke="var(--color-profit)" strokeWidth={1.25} dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="worst" stroke="var(--color-loss)" strokeWidth={1.25} dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="average" stroke="var(--color-chart-2)" strokeWidth={1.75} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="current" stroke="var(--color-accent)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Key({
  colorVar,
  label,
  dashed,
}: {
  colorVar: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-0.5 w-4 rounded-full"
        style={
          dashed
            ? {
                backgroundImage: `repeating-linear-gradient(90deg, var(${colorVar}) 0 4px, transparent 4px 7px)`,
              }
            : { background: `var(${colorVar})` }
        }
        aria-hidden
      />
      <span className="text-[11px] text-ink-secondary">{label}</span>
    </span>
  );
}

/**
 * Evidence, not advice. Every sentence states what the data shows; none of
 * them tells the user what to do, and none uses evaluative language about the
 * strategy's health.
 */
export function DecisionPanel({
  position,
  cont,
  model,
}: {
  position: HistoricalPosition | null;
  cont: ContinuationAnalysis | null;
  model: McModel;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Interpretation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Block label="Historical position">
          {position ? (
            <>
              <p className="text-body font-semibold text-ink">
                {position.band}
                {!position.outsideRange && ` · ${ordinal(position.percentile)} percentile`}
              </p>
              <p className="mt-1 text-label text-ink-secondary">
                Measured over {position.windowSize} trades against{" "}
                {position.comparisons.length.toLocaleString("en-US")} overlapping
                historical windows.
              </p>
            </>
          ) : (
            <p className="text-label text-ink-muted">
              Not enough history for a positional read.
            </p>
          )}
        </Block>

        <Block label="Historical continuation">
          {cont && cont.periods.length > 0 ? (
            <p className="text-label text-ink-secondary">
              Across the {cont.periods.length} most similar windows, equity
              exceeded the window-end level in{" "}
              <span className="font-medium text-ink">
                {plainPct(cont.recoveryPct)}
              </span>{" "}
              of cases
              {cont.medianRecoveryTrades !== null && (
                <>
                  , with a median of{" "}
                  <span className="font-medium text-ink">
                    {plural(cont.medianRecoveryTrades, "trade")}
                  </span>{" "}
                  to do so
                </>
              )}
              . The average of the next 50 trades was{" "}
              <span
                className={cn(
                  "font-medium",
                  (cont.avgNext50 ?? 0) >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {pctFmt(cont.avgNext50, 1)}
              </span>
              .
            </p>
          ) : (
            <p className="text-label text-ink-muted">
              No comparable windows with observable continuations.
            </p>
          )}
        </Block>

        <Block label="Simulation model">
          <p className="text-label text-ink-secondary">
            Projections on this page use{" "}
            <span className="font-medium text-ink">{MODEL_LABELS[model]}</span>{" "}
            sampling.
          </p>
        </Block>

        <Block label="Where this sits">
          {position ? (
            <p className="text-label text-ink-secondary">
              {position.outsideRange
                ? "The current window falls outside the range of every historical window at this size. There is no comparable precedent in this dataset."
                : "The current window falls inside the range of previously observed windows for this strategy."}
            </p>
          ) : (
            <p className="text-label text-ink-muted">—</p>
          )}
        </Block>

        <p className="border-t border-line pt-3 text-[11px] text-ink-muted">
          Statistical context from this account&apos;s own history. Not trading
          advice, and not a forecast.
        </p>
      </CardContent>
    </Card>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-eyebrow text-ink-muted">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function HistoricalExplorer({ cont }: { cont: ContinuationAnalysis }) {
  const [open, setOpen] = useState(false);
  const rows = open ? cont.periods : cont.periods.slice(0, 8);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader bordered>
        <div>
          <CardTitle>Historical explorer</CardTitle>
          <p className="mt-0.5 text-label text-ink-muted">
            Every comparable window, closest match first
          </p>
        </div>
        {cont.periods.length > 8 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-label font-medium text-accent transition-colors duration-150 ease-out hover:text-accent-hover"
          >
            {open ? "Show top 8" : `Show all ${cont.periods.length}`}
          </button>
        )}
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-raised">
            <tr>
              {[
                "Start",
                "End",
                "Return",
                "Drawdown",
                "PF",
                "Win rate",
                "Next 25",
                "Next 50",
                "Next 100",
              ].map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    "border-y border-line px-4 py-2.5 text-eyebrow font-medium whitespace-nowrap text-ink-muted",
                    i >= 2 && "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const w = p.window;
              const d = (v: Date) =>
                v.toLocaleDateString("en-US", {
                  year: "2-digit",
                  month: "short",
                  day: "numeric",
                });
              return (
                <tr
                  key={i}
                  className="border-b border-line transition-colors duration-150 ease-out last:border-0 hover:bg-raised"
                >
                  <td className="px-4 py-2.5 text-label whitespace-nowrap text-ink">
                    {d(w.startDate)}
                  </td>
                  <td className="px-4 py-2.5 text-label whitespace-nowrap text-ink-secondary">
                    {d(w.endDate)}
                  </td>
                  <Num v={w.returnPct} />
                  <td className="px-4 py-2.5 text-right text-label tnum whitespace-nowrap text-loss">
                    −{w.maxDrawdownPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-label tnum whitespace-nowrap text-ink-secondary">
                    {w.profitFactor >= 99 ? "∞" : w.profitFactor.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-label tnum whitespace-nowrap text-ink-secondary">
                    {w.winRate.toFixed(0)}%
                  </td>
                  <Num v={p.next25} />
                  <Num v={p.next50} />
                  <Num v={p.next100} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Num({ v }: { v: number | null }) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 text-right text-label font-medium tnum whitespace-nowrap",
        v === null
          ? "text-ink-muted"
          : v >= 0
            ? "text-profit"
            : "text-loss",
      )}
    >
      {pctFmt(v, 1)}
    </td>
  );
}
