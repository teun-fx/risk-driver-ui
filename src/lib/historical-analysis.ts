import type { Account, HistTrade } from "@/lib/data";
import { balanceBefore } from "@/lib/account-analytics";

/**
 * Historical-position engine.
 *
 * Everything here compares the account's CURRENT rolling window against every
 * comparable window in its own trade history — no external market data, no
 * predictions. We report where the present sits inside the strategy's own
 * distribution, and what actually followed historically similar windows.
 *
 * Deliberately absent: any "confidence" verdict. Rolling windows overlap
 * heavily (consecutive 100-trade windows share 99 trades), so a count of 370
 * windows is nowhere near 370 independent observations. Rather than publish a
 * flattering-but-wrong confidence badge, we publish the counts and let the
 * overlap be stated plainly.
 *
 * Language rule: positions are statistical ("Bottom 14%"), never emotional.
 */

export type WindowSpec =
  | { kind: "trades"; n: number }
  | { kind: "days"; n: number }
  | { kind: "adaptive" };

export const WINDOW_OPTIONS = [
  "Adaptive",
  "20 trades",
  "50 trades",
  "100 trades",
  "Last 30 days",
  "Last 90 days",
  "Last 180 days",
] as const;
export type WindowOption = (typeof WINDOW_OPTIONS)[number];

export function specFromOption(o: WindowOption): WindowSpec {
  switch (o) {
    case "20 trades":
      return { kind: "trades", n: 20 };
    case "50 trades":
      return { kind: "trades", n: 50 };
    case "100 trades":
      return { kind: "trades", n: 100 };
    case "Last 30 days":
      return { kind: "days", n: 30 };
    case "Last 90 days":
      return { kind: "days", n: 90 };
    case "Last 180 days":
      return { kind: "days", n: 180 };
    default:
      return { kind: "adaptive" };
  }
}

/** Per-trade fractional returns on the balance at the time of each trade. */
export function tradeReturns(account: Account, trades: HistTrade[]): number[] {
  const bals = balanceBefore(account, trades);
  return trades.map((t, i) => (bals[i] > 0 ? t.pnl / bals[i] : 0));
}

/**
 * Adaptive window: about one month of this strategy's trading, clamped to a
 * range where the statistics still mean something.
 */
export function adaptiveWindow(trades: HistTrade[]): number {
  if (trades.length < 40) return Math.max(10, Math.floor(trades.length / 3));
  const spanDays =
    (trades[trades.length - 1].date.getTime() - trades[0].date.getTime()) /
    86_400_000;
  const perDay = spanDays > 0 ? trades.length / spanDays : 1;
  const monthly = Math.round(perDay * 30);
  return Math.min(100, Math.max(20, monthly || 30));
}

export function resolveWindowSize(
  spec: WindowSpec,
  trades: HistTrade[],
): number {
  if (spec.kind === "trades") return spec.n;
  if (spec.kind === "adaptive") return adaptiveWindow(trades);
  // Days → trade count, from this strategy's own pace.
  const spanDays =
    trades.length > 1
      ? (trades[trades.length - 1].date.getTime() - trades[0].date.getTime()) /
        86_400_000
      : 1;
  const perDay = spanDays > 0 ? trades.length / spanDays : 1;
  return Math.max(10, Math.min(trades.length, Math.round(perDay * spec.n)));
}

/* ------------------------------------------------------------------ */
/* Window statistics                                                    */
/* ------------------------------------------------------------------ */

export type WindowStats = {
  /** Index of the window's first trade in the full history. */
  start: number;
  end: number; // exclusive
  startDate: Date;
  endDate: Date;
  /** Compounded return over the window, in percent. */
  returnPct: number;
  expectancyPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  longestLossStreak: number;
  volatilityPct: number;
  /**
   * How much the forward path must gain to regain the window's own peak.
   * 1 = the window ended at its high; 1.05 = it ended 5% below it.
   */
  peakToEndRatio: number;
};

function statsFor(
  rets: number[],
  trades: HistTrade[],
  start: number,
  end: number,
): WindowStats {
  const slice = rets.slice(start, end);
  const wins = slice.filter((r) => r > 0);
  const losses = slice.filter((r) => r < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  // Compounded return and intra-window drawdown on a normalised equity curve.
  let eq = 1;
  let peak = 1;
  let maxDD = 0;
  let streak = 0;
  let longest = 0;
  for (const r of slice) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, (peak - eq) / peak);
    if (r < 0) {
      streak++;
      longest = Math.max(longest, streak);
    } else if (r > 0) streak = 0;
  }

  const mean = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
  const sd = slice.length
    ? Math.sqrt(slice.reduce((a, r) => a + (r - mean) ** 2, 0) / slice.length)
    : 0;

  return {
    start,
    end,
    startDate: trades[start].date,
    endDate: trades[end - 1].date,
    returnPct: (eq - 1) * 100,
    expectancyPct: mean * 100,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    maxDrawdownPct: maxDD * 100,
    winRate: slice.length
      ? (wins.length / (wins.length + losses.length || 1)) * 100
      : 0,
    avgWinPct: wins.length ? (grossWin / wins.length) * 100 : 0,
    avgLossPct: losses.length ? (-grossLoss / losses.length) * 100 : 0,
    longestLossStreak: longest,
    volatilityPct: sd * 100,
    peakToEndRatio: eq > 0 ? Math.max(1, peak / eq) : 1,
  };
}

/** Every rolling window of the given size, stepped by 1 trade. */
export function rollingWindows(
  account: Account,
  trades: HistTrade[],
  size: number,
): WindowStats[] {
  if (trades.length < size + 1) return [];
  const rets = tradeReturns(account, trades);
  const out: WindowStats[] = [];
  for (let s = 0; s + size <= trades.length; s++) {
    out.push(statsFor(rets, trades, s, s + size));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Historical position                                                  */
/* ------------------------------------------------------------------ */

export type PositionBand =
  | "Top 10%"
  | "Above average"
  | "Average"
  | "Below average"
  | "Bottom 10%"
  | "Outside historical range";

export type HistoricalPosition = {
  windowSize: number;
  current: WindowStats;
  /** Every PRIOR window (the current one excluded from its own comparison). */
  comparisons: WindowStats[];
  percentile: number;
  band: PositionBand;
  /** Independent (non-overlapping) windows available — stated, not hidden. */
  independentCount: number;
  /** True when the current window is beyond every historical window. */
  outsideRange: boolean;
};

export function historicalPosition(
  account: Account,
  trades: HistTrade[],
  spec: WindowSpec,
): HistoricalPosition | null {
  const size = Math.min(resolveWindowSize(spec, trades), trades.length);
  if (trades.length < size + 5) return null;

  const all = rollingWindows(account, trades, size);
  if (all.length < 2) return null;

  const current = all[all.length - 1];
  // Compare against windows that don't include the present one's territory.
  const prior = all.slice(0, -1);
  const returns = prior.map((w) => w.returnPct).sort((a, b) => a - b);

  const below = returns.filter((r) => r < current.returnPct).length;
  const percentile = Math.round((below / returns.length) * 100);
  const outsideRange =
    current.returnPct > returns[returns.length - 1] ||
    current.returnPct < returns[0];

  const band: PositionBand = outsideRange
    ? "Outside historical range"
    : percentile >= 90
      ? "Top 10%"
      : percentile >= 65
        ? "Above average"
        : percentile > 35
          ? "Average"
          : percentile > 10
            ? "Below average"
            : "Bottom 10%";

  return {
    windowSize: size,
    current,
    comparisons: prior,
    percentile,
    band,
    independentCount: Math.floor(trades.length / size),
    outsideRange,
  };
}

/* ------------------------------------------------------------------ */
/* Similar periods + continuation                                       */
/* ------------------------------------------------------------------ */

export type SimilarPeriod = {
  window: WindowStats;
  /** 0 = identical; smaller is more similar. */
  distance: number;
  next25: number | null;
  next50: number | null;
  next100: number | null;
  /** Deepest additional drawdown in the 50 trades that followed, percent. */
  nextDrawdownPct: number | null;
  /** Trades until the window's ending equity was exceeded; null = never. */
  recoveryTrades: number | null;
};

const FEATURES = [
  "expectancyPct",
  "profitFactor",
  "maxDrawdownPct",
  "winRate",
  "avgWinPct",
  "avgLossPct",
  "longestLossStreak",
  "volatilityPct",
] as const;

/** Compounded return of the n trades following index `from`. */
function forwardReturn(rets: number[], from: number, n: number): number | null {
  if (from + n > rets.length) return null;
  let eq = 1;
  for (let i = from; i < from + n; i++) eq *= 1 + rets[i];
  return (eq - 1) * 100;
}

export type ContinuationAnalysis = {
  periods: SimilarPeriod[];
  avgNext25: number | null;
  avgNext50: number | null;
  avgNext100: number | null;
  positive25Pct: number | null;
  positive50Pct: number | null;
  positive100Pct: number | null;
  /** Share of similar periods whose equity exceeded the window-end level. */
  recoveryPct: number | null;
  deteriorationPct: number | null;
  medianRecoveryTrades: number | null;
  avgAdditionalDrawdownPct: number | null;
};

export function continuationAnalysis(
  account: Account,
  trades: HistTrade[],
  position: HistoricalPosition,
  maxPeriods = 30,
): ContinuationAnalysis {
  const rets = tradeReturns(account, trades);
  const cur = position.current;

  // z-score each feature across the comparison set so no single feature
  // (profit factor, typically) dominates the distance.
  const stats = FEATURES.map((f) => {
    const vals = position.comparisons.map((w) => w[f] as number);
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd =
      Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length || 1)) ||
      1;
    return { f, mean, sd };
  });

  const scored = position.comparisons
    // A period only counts if we can observe what came after it.
    .filter((w) => w.end + 25 <= trades.length)
    .map((w) => {
      let d = 0;
      for (const { f, mean, sd } of stats) {
        const a = ((w[f] as number) - mean) / sd;
        const b = ((cur[f] as number) - mean) / sd;
        d += (a - b) ** 2;
      }
      const distance = Math.sqrt(d);

      // Recovery = regaining the window's OWN peak, not merely posting one
      // green trade. A window that ended at its high needs no recovery (0).
      const needed = w.peakToEndRatio;
      let recoveryTrades: number | null = needed <= 1.0000001 ? 0 : null;
      let eq = 1;
      let worst = 0;
      let peak = 1;
      for (let i = w.end; i < Math.min(w.end + 200, rets.length); i++) {
        eq *= 1 + rets[i];
        peak = Math.max(peak, eq);
        worst = Math.min(worst, (eq - peak) / peak);
        if (recoveryTrades === null && eq >= needed) recoveryTrades = i - w.end + 1;
      }

      return {
        window: w,
        distance,
        next25: forwardReturn(rets, w.end, 25),
        next50: forwardReturn(rets, w.end, 50),
        next100: forwardReturn(rets, w.end, 100),
        nextDrawdownPct: worst * 100,
        recoveryTrades,
      } satisfies SimilarPeriod;
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxPeriods);

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const share = (xs: (number | null)[], pred: (n: number) => boolean) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? (v.filter(pred).length / v.length) * 100 : null;
  };

  const recovered = scored.filter((p) => p.recoveryTrades !== null);
  const recoveryLens = recovered
    .map((p) => p.recoveryTrades as number)
    .sort((a, b) => a - b);

  return {
    periods: scored,
    avgNext25: avg(scored.map((p) => p.next25)),
    avgNext50: avg(scored.map((p) => p.next50)),
    avgNext100: avg(scored.map((p) => p.next100)),
    positive25Pct: share(scored.map((p) => p.next25), (n) => n > 0),
    positive50Pct: share(scored.map((p) => p.next50), (n) => n > 0),
    positive100Pct: share(scored.map((p) => p.next100), (n) => n > 0),
    recoveryPct: scored.length ? (recovered.length / scored.length) * 100 : null,
    deteriorationPct: scored.length
      ? ((scored.length - recovered.length) / scored.length) * 100
      : null,
    medianRecoveryTrades: recoveryLens.length
      ? recoveryLens[Math.floor(recoveryLens.length / 2)]
      : null,
    avgAdditionalDrawdownPct: avg(scored.map((p) => p.nextDrawdownPct)),
  };
}

/* ------------------------------------------------------------------ */
/* Recovery curve                                                       */
/* ------------------------------------------------------------------ */

export type RecoveryCurve = {
  /** Trade offset from the end of the window (0 = window end). */
  t: number;
  current: number | null;
  average: number | null;
  best: number | null;
  worst: number | null;
}[];

/**
 * What happened after similar periods, indexed from the window's end — the
 * historical counterpart to the simulated Monte Carlo cloud.
 */
export function recoveryCurve(
  account: Account,
  trades: HistTrade[],
  position: HistoricalPosition,
  continuation: ContinuationAnalysis,
  horizon = 50,
): RecoveryCurve {
  const rets = tradeReturns(account, trades);

  const pathFrom = (endIdx: number) => {
    const p: (number | null)[] = [0];
    let eq = 1;
    for (let i = 1; i <= horizon; i++) {
      const idx = endIdx + i - 1;
      if (idx >= rets.length) {
        p.push(null);
        continue;
      }
      eq *= 1 + rets[idx];
      p.push((eq - 1) * 100);
    }
    return p;
  };

  const paths = continuation.periods.map((p) => pathFrom(p.window.end));
  // The live period: the trades that have happened since the window began.
  const current = pathFrom(position.current.start).slice(
    0,
    Math.min(horizon + 1, position.current.end - position.current.start + 1),
  );

  const rank = (arr: (number | null)[][], pick: (v: number[]) => number) =>
    Array.from({ length: horizon + 1 }, (_, i) => {
      const v = arr.map((p) => p[i]).filter((x): x is number => x !== null);
      return v.length ? pick(v) : null;
    });

  const avgAt = rank(paths, (v) => v.reduce((a, b) => a + b, 0) / v.length);
  // Best/worst chosen by FINAL outcome, then traced — not a per-point envelope,
  // which would draw two paths that no single period actually followed.
  const finals = paths.map((p) => {
    for (let i = p.length - 1; i >= 0; i--) if (p[i] !== null) return p[i] as number;
    return 0;
  });
  const bestIdx = finals.indexOf(Math.max(...finals));
  const worstIdx = finals.indexOf(Math.min(...finals));

  return Array.from({ length: horizon + 1 }, (_, i) => ({
    t: i,
    current: i < current.length ? current[i] : null,
    average: avgAt[i],
    best: paths[bestIdx]?.[i] ?? null,
    worst: paths[worstIdx]?.[i] ?? null,
  }));
}
