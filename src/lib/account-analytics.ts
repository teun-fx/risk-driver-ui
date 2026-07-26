import { tradeHistoryFor, type Account, type HistTrade } from "@/lib/data";

/**
 * Account Analytics engine — pure functions over the account's real closed
 * trades. One filtered list feeds every section, so the calendar, KPI cards
 * and analysis cards can never disagree with each other.
 *
 * Conventions (per spec):
 * - Break-even trades (pnl === 0) are excluded from win rate's numerator AND
 *   denominator, but reported separately.
 * - Net P&L is already net of commission + swap (parser guarantees it).
 * - Percentage returns use the balance at the time of each trade.
 * - Times are broker/statement time — the app has no timezone setting yet,
 *   and pretending otherwise would be inventing data.
 * - Every ratio guards division by zero; nothing returns NaN/Infinity.
 */

/* ---------------- filters ---------------- */

export type TradeFilter = {
  /** Inclusive close-date range, ISO yyyy-mm-dd or null for open end. */
  from: string | null;
  to: string | null;
  /** null = all. */
  symbol: string | null;
  /** 0 = Monday … 4 = Friday; null = all. */
  weekday: number | null;
  /** Entry hour 0–23; null = all. */
  hour: number | null;
  direction: "Long" | "Short" | null;
};

export const EMPTY_FILTER: TradeFilter = {
  from: null,
  to: null,
  symbol: null,
  weekday: null,
  hour: null,
  direction: null,
};

/** Entry time = close time minus holding time (statement gives us the close). */
export function entryDate(t: HistTrade): Date {
  return new Date(t.date.getTime() - t.durationHours * 3_600_000);
}

export function applyFilter(trades: HistTrade[], f: TradeFilter): HistTrade[] {
  const from = f.from ? new Date(f.from) : null;
  const to = f.to ? new Date(`${f.to}T23:59:59`) : null;
  return trades.filter((t) => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (f.symbol && t.pair !== f.symbol) return false;
    if (f.weekday !== null && t.date.getDay() - 1 !== f.weekday) return false;
    if (f.hour !== null && entryDate(t).getHours() !== f.hour) return false;
    if (f.direction && t.side !== f.direction) return false;
    return true;
  });
}

export function accountTrades(account: Account): HistTrade[] {
  return [...tradeHistoryFor(account)].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

/* ---------------- shared helpers ---------------- */

const safe = (v: number) => (Number.isFinite(v) ? v : 0);
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Balance before each trade, from the account's starting balance. */
export function balanceBefore(account: Account, trades: HistTrade[]): number[] {
  let bal = account.startingBalance ?? Math.max(1000, account.equity - trades.reduce((a, t) => a + t.pnl, 0));
  return trades.map((t) => {
    const b = bal;
    bal += t.pnl;
    return b;
  });
}

/** Risk amount per trade in $, when the account's risk% is known. */
function riskDollars(account: Account, balBefore: number): number | null {
  return account.riskPerTrade
    ? (account.riskPerTrade / 100) * balBefore
    : null;
}

export function rMultiple(
  account: Account,
  t: HistTrade,
  balBefore: number,
): number | null {
  const r = riskDollars(account, balBefore);
  return r && r > 0 ? t.pnl / r : null;
}

/* ---------------- summary table ---------------- */

export type Summary = {
  total: number;
  wins: number;
  losses: number;
  breakEven: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number; // negative
  commissions: number | null; // null = statement predates parser upgrade
  swaps: number | null;
  largestWin: number;
  largestLoss: number;
  avgWin: number;
  avgLoss: number; // negative
  avgHoldingHours: number;
  avgTradesPerDay: number;
  mostActiveWeekday: string | null;
  mostProfitableWeekday: string | null;
  leastProfitableWeekday: string | null;
};

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function summary(trades: HistTrade[]): Summary {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const be = trades.length - wins.length - losses.length;
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = losses.reduce((a, t) => a + t.pnl, 0);

  const hasCosts = trades.some((t) => t.commission !== undefined);
  const commissions = hasCosts
    ? trades.reduce((a, t) => a + (t.commission ?? 0), 0)
    : null;
  const swaps = hasCosts ? trades.reduce((a, t) => a + (t.swap ?? 0), 0) : null;

  const days = new Set(trades.map((t) => dayKey(t.date)));

  const perWd = WD.map((label, i) => {
    const list = trades.filter((t) => t.date.getDay() - 1 === i);
    return { label, n: list.length, pnl: list.reduce((a, t) => a + t.pnl, 0) };
  }).filter((w) => w.n > 0);

  const by = <K extends "n" | "pnl">(k: K, dir: 1 | -1) =>
    perWd.length
      ? [...perWd].sort((a, b) => (b[k] - a[k]) * dir)[0].label
      : null;

  return {
    total: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakEven: be,
    netPnl: grossProfit + grossLoss,
    grossProfit,
    grossLoss,
    commissions,
    swaps,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    avgHoldingHours: trades.length
      ? trades.reduce((a, t) => a + t.durationHours, 0) / trades.length
      : 0,
    avgTradesPerDay: days.size ? trades.length / days.size : 0,
    mostActiveWeekday: by("n", 1),
    mostProfitableWeekday: by("pnl", 1),
    leastProfitableWeekday: by("pnl", -1),
  };
}

/* ---------------- KPI row ---------------- */

export function kpis(account: Account, trades: HistTrade[]) {
  const s = summary(trades);
  const decided = s.wins + s.losses;
  const winRate = decided ? s.wins / decided : 0;
  const lossRate = decided ? s.losses / decided : 0;
  // Expectancy from its four components, per spec.
  const expectancy = winRate * s.avgWin + lossRate * s.avgLoss;
  const profitFactor =
    s.grossLoss !== 0 ? s.grossProfit / Math.abs(s.grossLoss) : s.grossProfit > 0 ? Infinity : 0;
  const dd = drawdown(account, trades);
  return {
    netPnl: s.netPnl,
    winRate: winRate * 100,
    breakEven: s.breakEven,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : null,
    expectancy: safe(expectancy),
    avgRR: s.avgLoss !== 0 ? safe(s.avgWin / Math.abs(s.avgLoss)) : null,
    maxDrawdownAbs: dd.maxAbs,
    maxDrawdownPct: dd.maxPct,
    recoveryFactor: dd.maxAbs > 0 ? safe(s.netPnl / dd.maxAbs) : null,
    commissions: s.commissions,
  };
}

/* ---------------- calendar ---------------- */

export type CalDay = { pnl: number; trades: HistTrade[] };

export function calendarDays(trades: HistTrade[]): Map<string, CalDay> {
  const map = new Map<string, CalDay>();
  for (const t of trades) {
    const k = dayKey(t.date);
    const d = map.get(k) ?? { pnl: 0, trades: [] };
    d.pnl += t.pnl;
    d.trades.push(t);
    map.set(k, d);
  }
  return map;
}

/* ---------------- cumulative chart ---------------- */

export type ChartMode = "P&L" | "Return %" | "R" | "Balance";

export type CumPoint = {
  i: number;
  date: string;
  value: number;
  /** Running high-water mark in the same unit. */
  hwm: number;
};

export function cumulativeSeries(
  account: Account,
  trades: HistTrade[],
  mode: ChartMode,
): { points: CumPoint[]; bands: { from: number; to: number }[] } {
  const balBefore = balanceBefore(account, trades);
  const start = balBefore[0] ?? account.startingBalance ?? 0;

  let cum = 0;
  let cumR = 0;
  const points: CumPoint[] = [];
  let hwm = -Infinity;

  trades.forEach((t, i) => {
    cum += t.pnl;
    const r = rMultiple(account, t, balBefore[i]);
    cumR += r ?? 0;
    const value =
      mode === "P&L"
        ? cum
        : mode === "Return %"
          ? start > 0
            ? (cum / start) * 100
            : 0
          : mode === "R"
            ? cumR
            : start + cum; // Balance
    hwm = Math.max(hwm, value);
    points.push({ i: i + 1, date: dayKey(t.date), value, hwm });
  });

  // Drawdown windows on this curve (peak → recovery), for shading.
  const bands: { from: number; to: number }[] = [];
  let peak = -Infinity;
  let openBand: number | null = null;
  points.forEach((p, idx) => {
    if (p.value >= peak) {
      if (openBand !== null) {
        bands.push({ from: openBand, to: p.i });
        openBand = null;
      }
      peak = p.value;
    } else if (openBand === null) {
      openBand = idx > 0 ? points[idx - 1].i : p.i;
    }
  });
  if (openBand !== null && points.length)
    bands.push({ from: openBand, to: points[points.length - 1].i });
  // Only shade meaningful windows (≥ 3 trades long), deepest-first cap of 6.
  const meaningful = bands.filter((b) => b.to - b.from >= 3).slice(0, 6);
  return { points, bands: meaningful };
}

/* ---------------- card 1: duration ---------------- */

const DUR_BUCKETS = [
  { label: "< 1m", max: 1 / 60 },
  { label: "1–5m", max: 5 / 60 },
  { label: "5–15m", max: 0.25 },
  { label: "15–30m", max: 0.5 },
  { label: "30–60m", max: 1 },
  { label: "1–4h", max: 4 },
  { label: "4–24h", max: 24 },
  { label: "> 24h", max: Infinity },
];

export function durationAnalysis(trades: HistTrade[]) {
  const buckets = DUR_BUCKETS.map((b) => ({
    label: b.label,
    n: 0,
    pnl: 0,
    wins: 0,
    decided: 0,
  }));
  for (const t of trades) {
    const i = DUR_BUCKETS.findIndex((b) => t.durationHours < b.max);
    const b = buckets[i === -1 ? buckets.length - 1 : i];
    b.n++;
    b.pnl += t.pnl;
    if (t.pnl > 0) {
      b.wins++;
      b.decided++;
    } else if (t.pnl < 0) b.decided++;
  }
  const used = buckets.filter((b) => b.n > 0);
  const pick = (fn: (a: (typeof buckets)[0], b: (typeof buckets)[0]) => number) =>
    used.length ? [...used].sort(fn)[0] : null;
  return {
    buckets: used,
    mostCommon: pick((a, b) => b.n - a.n),
    mostProfitable: pick((a, b) => b.pnl - a.pnl),
    leastProfitable: pick((a, b) => a.pnl - b.pnl),
    highestWinRate: used.length
      ? [...used]
          .filter((b) => b.decided >= 3)
          .sort((a, b) => b.wins / (b.decided || 1) - a.wins / (a.decided || 1))[0] ?? null
      : null,
    avgHoldingHours: trades.length
      ? trades.reduce((a, t) => a + t.durationHours, 0) / trades.length
      : 0,
  };
}

/* ---------------- card 2: intraday ---------------- */

export function intraday(trades: HistTrade[]) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    h,
    n: 0,
    pnl: 0,
    wins: 0,
    decided: 0,
  }));
  for (const t of trades) {
    const b = hours[entryDate(t).getHours()];
    b.n++;
    b.pnl += t.pnl;
    if (t.pnl > 0) {
      b.wins++;
      b.decided++;
    } else if (t.pnl < 0) b.decided++;
  }
  const active = hours.filter((b) => b.n > 0);
  const sortBy = (fn: (a: (typeof hours)[0], b: (typeof hours)[0]) => number) =>
    active.length ? [...active].sort(fn)[0] : null;
  return {
    hours: active,
    best: sortBy((a, b) => b.pnl - a.pnl),
    worst: sortBy((a, b) => a.pnl - b.pnl),
    busiest: sortBy((a, b) => b.n - a.n),
  };
}

/* ---------------- card 3: streaks ---------------- */

export function streaks(trades: HistTrade[]) {
  let curLen = 0;
  let curIsWin = true;
  let curPnl = 0;
  let bestWin = { len: 0, pnl: 0 };
  let worstLoss = { len: 0, pnl: 0 };
  const winRuns: number[] = [];
  const lossRuns: number[] = [];

  const flush = () => {
    if (curLen === 0) return;
    if (curIsWin) {
      winRuns.push(curLen);
      if (curLen > bestWin.len) bestWin = { len: curLen, pnl: curPnl };
    } else {
      lossRuns.push(curLen);
      if (curLen > worstLoss.len) worstLoss = { len: curLen, pnl: curPnl };
    }
  };

  for (const t of trades) {
    if (t.pnl === 0) continue; // break-even doesn't extend either streak
    const w = t.pnl > 0;
    if (curLen && w === curIsWin) {
      curLen++;
      curPnl += t.pnl;
    } else {
      flush();
      curIsWin = w;
      curLen = 1;
      curPnl = t.pnl;
    }
  }
  flush();

  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    longestWin: bestWin,
    longestLoss: worstLoss,
    current: { len: curLen, isWin: curIsWin, pnl: curPnl },
    avgWinStreak: avg(winRuns),
    avgLossStreak: avg(lossRuns),
  };
}

/* ---------------- card 4/5: drawdown & recovery ---------------- */

export function drawdown(account: Account, trades: HistTrade[]) {
  const balBefore = balanceBefore(account, trades);
  const start = balBefore[0] ?? account.startingBalance ?? 0;

  let bal = start;
  let peak = start;
  let peakDate: Date | null = trades[0] ? entryDate(trades[0]) : null;
  let maxAbs = 0;
  let maxPct = 0;
  let best = {
    peak: start,
    peakDate: peakDate,
    trough: start,
    troughDate: peakDate,
    recoveredDate: null as Date | null,
    tradesUnderwater: 0,
  };
  let curPeakDate = peakDate;
  let curTrough = start;
  let curTroughDate = peakDate;
  let curPeak = start;
  let underwater = 0;
  let maxUnderwaterDays = 0;
  let underwaterStart: Date | null = null;

  for (const t of trades) {
    bal += t.pnl;
    if (bal >= peak) {
      // Recovered — close the current episode if it was the deepest.
      if (curPeak - curTrough > maxAbs) {
        maxAbs = curPeak - curTrough;
        maxPct = curPeak > 0 ? (maxAbs / curPeak) * 100 : 0;
        best = {
          peak: curPeak,
          peakDate: curPeakDate,
          trough: curTrough,
          troughDate: curTroughDate,
          recoveredDate: t.date,
          tradesUnderwater: underwater,
        };
      }
      if (underwaterStart) {
        maxUnderwaterDays = Math.max(
          maxUnderwaterDays,
          (t.date.getTime() - underwaterStart.getTime()) / 86_400_000,
        );
        underwaterStart = null;
      }
      peak = bal;
      peakDate = t.date;
      curPeak = bal;
      curPeakDate = t.date;
      curTrough = bal;
      curTroughDate = t.date;
      underwater = 0;
    } else {
      underwater++;
      if (!underwaterStart) underwaterStart = t.date;
      if (bal < curTrough) {
        curTrough = bal;
        curTroughDate = t.date;
      }
    }
  }
  // Possibly still underwater at the end.
  const last = trades[trades.length - 1];
  if (curPeak - curTrough > maxAbs) {
    maxAbs = curPeak - curTrough;
    maxPct = curPeak > 0 ? (maxAbs / curPeak) * 100 : 0;
    best = {
      peak: curPeak,
      peakDate: curPeakDate,
      trough: curTrough,
      troughDate: curTroughDate,
      recoveredDate: null,
      tradesUnderwater: underwater,
    };
  }
  if (underwaterStart && last) {
    maxUnderwaterDays = Math.max(
      maxUnderwaterDays,
      (last.date.getTime() - underwaterStart.getTime()) / 86_400_000,
    );
  }

  const currentDD = peak - bal;
  return {
    maxAbs,
    maxPct,
    episode: best,
    currentAbs: currentDD,
    currentPct: peak > 0 ? (currentDD / peak) * 100 : 0,
    finalBalance: bal,
    maxUnderwaterDays: Math.round(maxUnderwaterDays),
  };
}

/* ---------------- card 6: consistency ---------------- */

export function consistency(trades: HistTrade[]) {
  if (trades.length < 5) {
    return { score: null as number | null, label: "Not enough data", topDaySharePct: null as number | null, profitableDaysPct: null as number | null };
  }
  const days = calendarDays(trades);
  const dayPnls = [...days.values()].map((d) => d.pnl);
  const totalProfit = dayPnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const net = dayPnls.reduce((a, b) => a + b, 0);

  const profitableDaysPct =
    dayPnls.length > 0
      ? dayPnls.filter((p) => p > 0).length / dayPnls.length
      : 0;
  const topDay = dayPnls.length ? Math.max(...dayPnls) : 0;
  const topDayShare = totalProfit > 0 ? topDay / totalProfit : 1;
  const topTrade = Math.max(...trades.map((t) => t.pnl), 0);
  const topTradeShare = totalProfit > 0 ? topTrade / totalProfit : 1;

  // Variability of daily returns (coefficient of variation, clamped).
  const mean = net / (dayPnls.length || 1);
  const sd = Math.sqrt(
    dayPnls.reduce((a, p) => a + (p - mean) ** 2, 0) / (dayPnls.length || 1),
  );
  const cv = mean !== 0 ? Math.min(3, Math.abs(sd / mean)) : 3;

  // Sizing stability, only when lots exist on the statement.
  const lots = trades.map((t) => t.lots).filter((l): l is number => l != null);
  let sizing: number | null = null;
  if (lots.length >= 5) {
    const lm = lots.reduce((a, b) => a + b, 0) / lots.length;
    const lsd = Math.sqrt(lots.reduce((a, l) => a + (l - lm) ** 2, 0) / lots.length);
    sizing = lm > 0 ? Math.max(0, 1 - Math.min(1, lsd / lm)) : 0;
  }

  const parts = [
    profitableDaysPct, // more green days
    Math.max(0, 1 - topDayShare), // less best-day dependency
    Math.max(0, 1 - topTradeShare), // less best-trade dependency
    Math.max(0, 1 - cv / 3), // steadier daily results
    ...(sizing !== null ? [sizing] : []),
  ];
  const score = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
  const label =
    score >= 80
      ? "Highly consistent"
      : score >= 60
        ? "Consistent"
        : score >= 40
          ? "Developing"
          : "Volatile";
  return {
    score,
    label,
    topDaySharePct: Math.round(topDayShare * 100),
    profitableDaysPct: Math.round(profitableDaysPct * 100),
  };
}

/* ---------------- cards 7/8: Sharpe & Sortino ---------------- */

export function riskRatios(account: Account, trades: HistTrade[]) {
  const balBefore = balanceBefore(account, trades);
  // Per-trade returns on the balance at the time of the trade.
  const tradeRets = trades.map((t, i) =>
    balBefore[i] > 0 ? t.pnl / balBefore[i] : 0,
  );
  // Daily returns, when enough distinct days exist.
  const byDay = new Map<string, number>();
  trades.forEach((t, i) => {
    const k = dayKey(t.date);
    byDay.set(k, (byDay.get(k) ?? 0) + (balBefore[i] > 0 ? t.pnl / balBefore[i] : 0));
  });
  const dailyRets = [...byDay.values()];
  const useDaily = dailyRets.length >= 20;
  const rets = useDaily ? dailyRets : tradeRets;

  const n = rets.length;
  const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n
    ? Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / n)
    : 0;
  const downside = n
    ? Math.sqrt(rets.reduce((a, r) => a + Math.min(0, r) ** 2, 0) / n)
    : 0;

  const ann = useDaily ? Math.sqrt(252) : 1; // trade-level stays unannualised
  const sharpe = sd > 0 ? (mean / sd) * ann : null;
  const sortino = downside > 0 ? (mean / downside) * ann : null;

  const rate = (v: number | null) =>
    v === null
      ? "—"
      : v >= 3
        ? "Excellent"
        : v >= 2
          ? "Good"
          : v >= 1
            ? "Fair"
            : "Poor";

  return {
    frequency: useDaily ? "daily returns" : "trade-level returns (not annualised)",
    n,
    meanPct: mean * 100,
    volPct: sd * 100,
    downsidePct: downside * 100,
    sharpe,
    sortino,
    sharpeRating: rate(sharpe),
    sortinoRating: rate(sortino),
    riskFree: 0,
    mar: 0,
  };
}
