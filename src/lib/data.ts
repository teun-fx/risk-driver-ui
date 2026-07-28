/**
 * Placeholder content only. Shapes are realistic so components can be wired
 * to a real source later without changing their props.
 *
 * Everything is derived from the selected account, including how far back the
 * monthly-returns table reaches (an account live since 2020 shows 2020-now).
 */

import { money } from "@/lib/utils";

export type Range = "1M" | "3M" | "6M" | "1Y" | "Max";
export const RANGES = ["1M", "3M", "6M", "1Y", "Max"] as const;

/** Today, as the app sees it. Single source for "now". */
export const TODAY = new Date("2026-07-23");

/** Deterministic pseudo-random so server and client render identically. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export type Account = {
  id: string;
  name: string;
  broker: string;
  /** Year the account went live — drives the monthly-returns range. */
  since: number;
  equity: number;
  /** "demo" = seeded placeholder; "html" = imported from a broker statement. */
  source?: "demo" | "html";
  /** Present only for imported accounts — every view derives from these. */
  trades?: HistTrade[];
  /** Balance before the first imported trade. */
  startingBalance?: number;
  /** Risk taken per trade, as a percent of balance (manual, for HTML imports). */
  riskPerTrade?: number;
  /** Imported accounts have no benchmark index in their statement. */
  hasBenchmark?: boolean;
  /** User-set label like "Prop · Evaluation" — not derivable from a statement. */
  accountType?: string;
  /** ISO timestamp of the last import/edit, for the overview's Last updated. */
  updatedAt?: string;
};

/** The two demo accounts kept alongside imported ones (widest date range). */
export const demoAccounts: Account[] = [
  { id: "apex-250", name: "Apex Funded 250K", broker: "Apex · Evaluation", since: 2024, equity: 312_480, source: "demo", hasBenchmark: true },
  { id: "ic-personal", name: "Personal — IC Markets", broker: "IC Markets · Live", since: 2020, equity: 64_310, source: "demo", hasBenchmark: true },
];

/** @deprecated Use demoAccounts + imported accounts via the account context. */
export const accounts = demoAccounts;

/* ------------------------------------------------------------------ */
/* Imported accounts — every view derives from the real closed trades  */
/* ------------------------------------------------------------------ */

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** One equity point per day, from the starting balance + cumulative P&L. */
function importedDailyEquity(account: Account): { date: Date; equity: number }[] {
  const trades = [...(account.trades ?? [])].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  if (!trades.length) return [];

  const out: { date: Date; equity: number }[] = [];
  let bal = account.startingBalance ?? 0;

  const cursor = new Date(trades[0].date);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(trades[trades.length - 1].date);
  last.setHours(0, 0, 0, 0);

  // A seed point one day before the first trade, at the starting balance.
  const seed = new Date(cursor);
  seed.setDate(seed.getDate() - 1);
  out.push({ date: seed, equity: bal });

  let ti = 0;
  while (cursor <= last) {
    while (ti < trades.length && sameDay(trades[ti].date, cursor)) {
      bal += trades[ti].pnl;
      ti++;
    }
    out.push({ date: new Date(cursor), equity: Math.round(bal) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function importedEquitySeries(range: Range, account: Account): EquityPoint[] {
  const daily = importedDailyEquity(account);
  if (!daily.length) return [];
  // "Max" shows the whole history; other ranges window back from the last trade.
  let pts = daily;
  if (range !== "Max") {
    const days = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }[range];
    const end = daily[daily.length - 1].date;
    const cutoff = new Date(end);
    cutoff.setDate(cutoff.getDate() - days);
    const windowed = daily.filter((p) => p.date >= cutoff);
    pts = windowed.length > 1 ? windowed : daily;
  }
  // benchmark mirrors equity and is hidden by the chart (hasBenchmark:false).
  return pts.map((p) => ({
    date: p.date.toISOString().slice(0, 10),
    equity: p.equity,
    benchmark: p.equity,
  }));
}

function importedMaxDrawdown(account: Account): number {
  const daily = importedDailyEquity(account);
  let peak = -Infinity;
  let maxDD = 0;
  for (const p of daily) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) maxDD = Math.min(maxDD, ((p.equity - peak) / peak) * 100);
  }
  return maxDD;
}

function importedKpis(account: Account) {
  const trades = account.trades ?? [];
  const daily = importedDailyEquity(account);
  const equity = daily.length ? daily[daily.length - 1].equity : account.equity;
  const start = account.startingBalance ?? 0;

  // Realized P&L in the final calendar month present in the statement.
  const last = trades[trades.length - 1]?.date ?? TODAY;
  const monthPnl = trades
    .filter(
      (t) =>
        t.date.getFullYear() === last.getFullYear() &&
        t.date.getMonth() === last.getMonth(),
    )
    .reduce((a, t) => a + t.pnl, 0);

  const wins = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const totalReturn = start ? ((equity - start) / start) * 100 : 0;

  return [
    { label: "Account equity", value: equity, delta: totalReturn, caption: "since inception", format: "money" as const },
    { label: "Realized P&L", value: Math.round(monthPnl), delta: start ? (monthPnl / start) * 100 : 0, caption: "final month", format: "money" as const },
    { label: "Win rate", value: winRate, delta: 0, caption: `${trades.length} trades closed`, format: "pct" as const },
    { label: "Max drawdown", value: importedMaxDrawdown(account), delta: 0, caption: "peak to trough", format: "pct" as const },
  ];
}

function importedStats(account: Account) {
  const trades = account.trades ?? [];
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.pnl, 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const net = trades.reduce((a, t) => a + t.pnl, 0);

  // Sharpe proxy from daily equity returns.
  const daily = importedDailyEquity(account);
  const rets: number[] = [];
  for (let i = 1; i < daily.length; i++) {
    const prev = daily[i - 1].equity;
    if (prev) rets.push((daily[i].equity - prev) / prev);
  }
  const mean = rets.reduce((a, r) => a + r, 0) / (rets.length || 1);
  const sd =
    Math.sqrt(
      rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length || 1),
    ) || 1;
  const sharpe = (mean / sd) * Math.sqrt(252);

  let longest = 0;
  let run = 0;
  let runWin = true;
  for (const t of trades) {
    const w = t.pnl >= 0;
    if (w === runWin) run++;
    else {
      run = 1;
      runWin = w;
    }
    if (runWin) longest = Math.max(longest, run);
  }

  return [
    { label: "Profit factor", value: (grossLoss ? grossWin / grossLoss : grossWin).toFixed(2) },
    { label: "Sharpe ratio", value: sharpe.toFixed(2) },
    { label: "Avg win", value: money(Math.round(avgWin)) },
    { label: "Avg loss", value: money(Math.round(avgLoss)) },
    { label: "Expectancy", value: money(Math.round(net / (trades.length || 1)), { signed: true }) },
    { label: "Longest streak", value: `${longest}W` },
  ];
}

function importedPairs(account: Account) {
  const trades = account.trades ?? [];
  const map = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of trades) {
    const e = map.get(t.pair) ?? { trades: 0, wins: 0, pnl: 0 };
    e.trades++;
    if (t.pnl >= 0) e.wins++;
    e.pnl += t.pnl;
    map.set(t.pair, e);
  }
  const total = trades.length || 1;
  return [...map.entries()]
    .map(([name, e]) => ({
      name,
      value: Math.round((e.trades / total) * 100),
      trades: e.trades,
      winRate: Math.round((e.wins / e.trades) * 100),
      pnl: Math.round(e.pnl),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function importedTrades(account: Account): Trade[] {
  const trades = [...(account.trades ?? [])].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
  const last = trades[0]?.date ?? TODAY;
  return trades.slice(0, 6).map((t) => {
    const days = Math.round((last.getTime() - t.date.getTime()) / 86_400_000);
    const time = days === 0 ? "Latest" : days === 1 ? "1 day earlier" : `${days} days earlier`;
    return { pair: t.pair, side: t.side, pnl: t.pnl, time };
  });
}

function importedMonthlyReturns(account: Account): YearReturns[] {
  const daily = importedDailyEquity(account);
  if (!daily.length) return [];
  const startYear = daily[0].date.getFullYear();
  const endYear = daily[daily.length - 1].date.getFullYear();

  // Month-end balance lookup, plus intra-month low for drawdown.
  const rows: YearReturns[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const months = MONTHS.map((_, m): MonthCell | null => {
      const inMonth = daily.filter(
        (p) => p.date.getFullYear() === year && p.date.getMonth() === m,
      );
      if (!inMonth.length) return null;
      const before = daily.filter(
        (p) =>
          p.date < new Date(year, m, 1) ||
          (p.date.getFullYear() === year && p.date.getMonth() === m && false),
      );
      const openBal = before.length ? before[before.length - 1].equity : (account.startingBalance ?? inMonth[0].equity);
      const closeBal = inMonth[inMonth.length - 1].equity;
      const ret = openBal ? ((closeBal - openBal) / openBal) * 100 : 0;
      // Intra-month drawdown from the month's running low against its peak.
      let peak = openBal;
      let dd = 0;
      for (const p of inMonth) {
        peak = Math.max(peak, p.equity);
        if (peak > 0) dd = Math.min(dd, ((p.equity - peak) / peak) * 100);
      }
      return { ret: Math.round(ret * 100) / 100, dd: Math.round(dd * 100) / 100 };
    });
    const total =
      (months.reduce<number>((acc, v) => acc * (1 + (v?.ret ?? 0) / 100), 1) - 1) *
      100;
    rows.push({ year, months, total: Math.round(total * 100) / 100 });
  }
  return rows.reverse();
}

/* ------------------------------------------------------------------ */
/* Equity curve                                                        */
/* ------------------------------------------------------------------ */

export type EquityPoint = { date: string; equity: number; benchmark: number };

export function equitySeries(range: Range, account: Account): EquityPoint[] {
  if (account.source === "html") return importedEquitySeries(range, account);
  // Demos only hold ~1y of seeded data, so "Max" is the same as 1Y for them.
  const days = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365, Max: 365 }[range];
  const step = Math.max(1, Math.round(days / 60));
  const rand = seeded(hash(account.id));
  const out: EquityPoint[] = [];
  let equity = account.equity * 0.82;
  let benchmark = account.equity * 0.82;
  const start = new Date(TODAY);
  start.setDate(start.getDate() - days);

  for (let i = 0; i <= days; i += step) {
    equity *= 1 + (rand() - 0.44) * 0.017;
    benchmark *= 1 + (rand() - 0.47) * 0.009;
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push({
      date: d.toISOString().slice(0, 10),
      equity: Math.round(equity),
      benchmark: Math.round(benchmark),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

export function kpisFor(account: Account) {
  if (account.source === "html") return importedKpis(account);
  const rand = seeded(hash(account.id) + 7);
  const winRate = 54 + rand() * 12;
  const realized = Math.round(account.equity * (0.06 + rand() * 0.05));
  return [
    { label: "Account equity", value: account.equity, delta: 3.2 + rand() * 3, caption: "vs. last month", format: "money" as const },
    { label: "Realized P&L", value: realized, delta: 8 + rand() * 8, caption: "month to date", format: "money" as const },
    { label: "Win rate", value: winRate, delta: 1 + rand() * 2.5, caption: `${120 + Math.round(rand() * 90)} trades closed`, format: "pct" as const },
    { label: "Max drawdown", value: -(5 + rand() * 6), delta: 1 + rand() * 2, caption: "peak to trough", format: "pct" as const },
  ];
}

export function riskFor(account: Account) {
  const rand = seeded(hash(account.id) + 21);
  const used = Math.round(45 + rand() * 35);
  const exposure = Math.round(28 + rand() * 30);
  return {
    used,
    metrics: [
      { label: "Risk used", value: used, tone: used > 70 ? ("loss" as const) : ("warn" as const), detail: `${(used / 10).toFixed(1)}% of 10% daily cap` },
      { label: "Exposure", value: exposure, tone: "accent" as const, detail: `$${Math.round((account.equity * exposure) / 100 / 1000)}k of $${Math.round(account.equity / 1000)}k equity` },
      { label: "Margin health", value: Math.round(70 + rand() * 25), tone: "profit" as const, detail: "Comfortable" },
    ],
  };
}

export function statsFor(account: Account) {
  if (account.source === "html") return importedStats(account);
  const rand = seeded(hash(account.id) + 33);
  return [
    { label: "Profit factor", value: (1.4 + rand() * 0.9).toFixed(2) },
    { label: "Sharpe ratio", value: (1.0 + rand() * 0.9).toFixed(2) },
    { label: "Avg win", value: `$${Math.round(600 + rand() * 900).toLocaleString("en-US")}` },
    { label: "Avg loss", value: `$${Math.round(300 + rand() * 450).toLocaleString("en-US")}` },
    { label: "Expectancy", value: `$${Math.round(200 + rand() * 400).toLocaleString("en-US")}` },
    { label: "Longest streak", value: `${4 + Math.round(rand() * 6)}W` },
  ];
}

/* ------------------------------------------------------------------ */
/* Traded pairs                                                        */
/* ------------------------------------------------------------------ */

/**
 * Four pairs, matching the four-slot chart ramp. The ramp is never cycled,
 * so a fifth pair folds into "Other" rather than inventing a new hue.
 */
export const PAIRS = ["XAUUSD", "EURUSD", "GBPJPY", "USDJPY"] as const;
export type Pair = (typeof PAIRS)[number];

export function pairsFor(account: Account) {
  if (account.source === "html") return importedPairs(account);
  const rand = seeded(hash(account.id) + 51);
  const raw = PAIRS.map(() => 10 + rand() * 40);
  const total = raw.reduce((a, b) => a + b, 0);
  const rounded = raw.map((v) => Math.round((v / total) * 100));
  // Force the parts to sum to exactly 100 so the bar never under/overfills.
  const drift = 100 - rounded.reduce((a, b) => a + b, 0);
  rounded[0] += drift;

  return PAIRS.map((name, i) => ({
    name,
    value: rounded[i],
    trades: 12 + Math.round(rand() * 60),
    winRate: Math.round(42 + rand() * 30),
    pnl: Math.round((rand() - 0.35) * 9000 * (account.equity / 250_000)),
  })).sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ */
/* Open positions                                                      */
/* ------------------------------------------------------------------ */

export type Position = {
  pair: string;
  market: string;
  side: "Long" | "Short";
  size: string;
  entry: number;
  mark: number;
  pnl: number;
  pnlPct: number;
  risk: "Low" | "Elevated" | "High";
};

/** Reference price per pair — mark is derived from entry, not invented twice. */
const PAIR_META: Record<Pair, { market: string; price: number; tick: number }> = {
  XAUUSD: { market: "Gold vs. US Dollar", price: 2684.1, tick: 14 },
  EURUSD: { market: "Euro vs. US Dollar", price: 1.0842, tick: 0.006 },
  GBPJPY: { market: "Sterling vs. Yen", price: 189.45, tick: 0.9 },
  USDJPY: { market: "US Dollar vs. Yen", price: 155.2, tick: 0.7 },
};

export function positionsFor(account: Account): Position[] {
  const rand = seeded(hash(account.id) + 103);
  const scale = account.equity / 250_000;

  return PAIRS.map((pair) => {
    const meta = PAIR_META[pair];
    const side: "Long" | "Short" = rand() > 0.45 ? "Long" : "Short";
    const drift = (rand() - 0.42) * meta.tick;
    const entry = meta.price;
    const mark = entry + drift;

    // A short profits when the mark falls below entry.
    const dir = side === "Long" ? 1 : -1;
    const pnlPct = ((mark - entry) / entry) * 100 * dir;
    const lots = 0.5 + Math.round(rand() * 30) / 10;

    return {
      pair,
      market: meta.market,
      side,
      size: `${lots.toFixed(1)} lots`,
      entry,
      mark,
      pnl: Math.round(pnlPct * 1000 * scale * lots),
      pnlPct,
      risk: (Math.abs(pnlPct) > 0.55 && pnlPct < 0
        ? "High"
        : pnlPct < 0
          ? "Elevated"
          : "Low") as Position["risk"],
    };
  });
}

/** Total notional across open positions, for the card subtitle. */
export function notionalFor(account: Account) {
  return Math.round(account.equity * 0.41);
}

/* ------------------------------------------------------------------ */
/* Trades                                                              */
/* ------------------------------------------------------------------ */

export type Trade = {
  pair: string;
  side: "Long" | "Short";
  pnl: number;
  time: string;
};

const TIMES = ["12 min ago", "48 min ago", "2 hr ago", "4 hr ago", "Yesterday", "Yesterday"];

export function tradesFor(account: Account): Trade[] {
  if (account.source === "html") return importedTrades(account);
  const rand = seeded(hash(account.id) + 67);
  return TIMES.map((time) => {
    const pair = PAIRS[Math.floor(rand() * PAIRS.length)];
    const win = rand() > 0.38;
    const magnitude = Math.round((200 + rand() * 3200) * (account.equity / 250_000));
    return {
      pair,
      side: rand() > 0.5 ? "Long" : "Short",
      pnl: win ? magnitude : -magnitude,
      time,
    } satisfies Trade;
  });
}

/* ------------------------------------------------------------------ */
/* Trade history — the source for every analytics breakdown            */
/* ------------------------------------------------------------------ */

export type HistTrade = {
  id: number;
  /** Close time of the position. */
  date: Date;
  /** Symbol — a fixed Pair for demo data, any broker symbol when imported. */
  pair: string;
  side: "Long" | "Short";
  /** Net realized P&L (gross + commission + swap). */
  pnl: number;
  /** How long the position was held, in hours. */
  durationHours: number;
  /** Position size in lots — present only on statements parsed since the
      parser upgrade; older stored accounts show "—" until re-uploaded. */
  lots?: number;
  /** Commission for the trade, negative. Optional for the same reason. */
  commission?: number;
  /** Swap/rollover for the trade. Optional for the same reason. */
  swap?: number;
};

/**
 * ~14 months of closed trades. Every analytics view derives from this one
 * array, so the distribution, the streaks and the weekday breakdown can never
 * disagree with each other.
 */
export function tradeHistoryFor(account: Account): HistTrade[] {
  // Imported accounts carry their real closed trades; demos are seeded.
  if (account.trades) return account.trades;
  const rand = seeded(hash(account.id) + 131);
  const scale = account.equity / 250_000;
  const out: HistTrade[] = [];
  const cursor = new Date(TODAY);
  cursor.setDate(cursor.getDate() - 420);

  let id = 0;
  while (cursor < TODAY) {
    cursor.setDate(cursor.getDate() + 1 + Math.floor(rand() * 3));
    if (cursor >= TODAY) break;
    // Markets are shut at the weekend, so no trades land there.
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) continue;

    const win = rand() > 0.42;
    // Winners run bigger than losers — the shape a positive expectancy has.
    const magnitude = win
      ? (300 + rand() * 3400) * scale
      : (250 + rand() * 1900) * scale;

    out.push({
      id: id++,
      date: new Date(cursor),
      pair: PAIRS[Math.floor(rand() * PAIRS.length)],
      side: rand() > 0.5 ? "Long" : "Short",
      pnl: Math.round(win ? magnitude : -magnitude),
      // Intraday to a few days — a swing trader's spread.
      durationHours: Math.round((0.5 + rand() * 71) * 10) / 10,
    });
  }
  return out;
}

/* ---- Underwater / drawdown ---- */

export type UnderwaterPoint = { date: string; drawdown: number };

/**
 * Percentage below the running peak at each point — the underwater plot.
 * Always <= 0; a value of 0 means the account is at a new high.
 */
export function underwaterSeries(
  range: Range,
  account: Account,
): UnderwaterPoint[] {
  let peak = -Infinity;
  return equitySeries(range, account).map((p) => {
    peak = Math.max(peak, p.equity);
    return {
      date: p.date,
      drawdown: ((p.equity - peak) / peak) * 100,
    };
  });
}

export function maxDrawdown(range: Range, account: Account) {
  return Math.min(...underwaterSeries(range, account).map((p) => p.drawdown));
}

/* ---- Profit distribution ---- */

export type Bucket = { label: string; count: number; sign: "win" | "loss" };

/** Trade P&L grouped into fixed bands, scaled to the account size. */
export function profitDistribution(account: Account): Bucket[] {
  const scale = account.equity / 250_000;
  const edges = [500, 1500, 3000].map((e) => e * scale);
  const bands: Bucket[] = [
    { label: "< −3k", count: 0, sign: "loss" },
    { label: "−3k…−1.5k", count: 0, sign: "loss" },
    { label: "−1.5k…−500", count: 0, sign: "loss" },
    { label: "−500…0", count: 0, sign: "loss" },
    { label: "0…500", count: 0, sign: "win" },
    { label: "500…1.5k", count: 0, sign: "win" },
    { label: "1.5k…3k", count: 0, sign: "win" },
    { label: "> 3k", count: 0, sign: "win" },
  ];

  for (const t of tradeHistoryFor(account)) {
    const v = t.pnl;
    let i: number;
    if (v < -edges[2]) i = 0;
    else if (v < -edges[1]) i = 1;
    else if (v < -edges[0]) i = 2;
    else if (v < 0) i = 3;
    else if (v < edges[0]) i = 4;
    else if (v < edges[1]) i = 5;
    else if (v < edges[2]) i = 6;
    else i = 7;
    bands[i].count++;
  }
  return bands;
}

/* ---- Win / loss sequence ---- */

export function winLossSequence(account: Account, limit = 120) {
  const trades = tradeHistoryFor(account).slice(-limit);
  const results = trades.map((t) => t.pnl >= 0);

  let longestWin = 0;
  let longestLoss = 0;
  let run = 0;
  let runIsWin = results[0] ?? true;

  for (const win of results) {
    if (win === runIsWin) run++;
    else {
      run = 1;
      runIsWin = win;
    }
    if (runIsWin) longestWin = Math.max(longestWin, run);
    else longestLoss = Math.max(longestLoss, run);
  }

  // The trailing run is the current streak.
  let current = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === results[results.length - 1]) current++;
    else break;
  }

  return {
    results,
    longestWin,
    longestLoss,
    currentStreak: current,
    currentIsWin: results[results.length - 1] ?? true,
    wins: results.filter(Boolean).length,
    total: results.length,
  };
}

/* ---- Trade outcomes: donut + core ratios ---- */

export type TradeOutcomes = {
  wins: number;
  losses: number;
  breakEven: number;
  total: number;
  winPct: number;
  lossPct: number;
  breakEvenPct: number;
  /** Average win divided by average loss — "1 : x". */
  riskReward: number;
  /** Mean P&L per closed trade. */
  expectancy: number;
  /** Gross profit divided by gross loss. */
  profitFactor: number;
};

/**
 * Outcome split and core ratios, all from the same closed-trade history the
 * rest of analytics uses — the donut can never disagree with the equity curve.
 * "Break-even" is a band, not exactly $0: anything within ±$500 (scaled to
 * account size) counts as flat.
 */
export function tradeOutcomes(account: Account): TradeOutcomes {
  const trades = tradeHistoryFor(account);
  // Imported accounts classify purely by sign (win/loss), matching how the
  // broker report counts — a "$500 scaled to equity" band would wrongly bucket
  // real wins/losses as break-even on a large account. Demos keep the band.
  const band =
    account.source === "html" ? 0.005 : 500 * (account.equity / 250_000);

  let wins = 0;
  let losses = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let net = 0;

  for (const t of trades) {
    net += t.pnl;
    // Within the band counts as flat — neither a win nor a loss.
    if (Math.abs(t.pnl) < band) continue;
    if (t.pnl > 0) {
      wins++;
      grossWin += t.pnl;
    } else {
      losses++;
      grossLoss += -t.pnl;
    }
  }

  const sampleTotal = trades.length;
  const avgWin = wins ? grossWin / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 1;

  // The sample is ~14 months (see tradeHistoryFor). Extrapolate the outcome
  // split across the account's full life so the header and legend reflect ALL
  // trades on the account, not just the analysis window. Percentages and
  // ratios are unchanged — only the counts scale up.
  // Imported accounts report their real trade count; demo accounts extrapolate
  // the ~14-month sample across the account's life.
  const openedAt = new Date(account.since, 0, 1);
  const ageDays = (TODAY.getTime() - openedAt.getTime()) / 86_400_000;
  const factor = account.source === "html" ? 1 : Math.max(1, ageDays / 420);
  const total = Math.round(sampleTotal * factor);

  const winPct = Math.round((wins / sampleTotal) * 100);
  const lossPct = Math.round((losses / sampleTotal) * 100);
  const breakEvenPct = Math.max(0, 100 - winPct - lossPct);

  // Scale counts to the lifetime total; break-even absorbs the rounding
  // remainder so wins + losses + breakEven === total exactly.
  const lifeWins = Math.round((winPct / 100) * total);
  const lifeLosses = Math.round((lossPct / 100) * total);
  const lifeBreakEven = total - lifeWins - lifeLosses;

  return {
    wins: lifeWins,
    losses: lifeLosses,
    breakEven: lifeBreakEven,
    total,
    winPct,
    lossPct,
    breakEvenPct,
    riskReward: avgWin / avgLoss,
    expectancy: Math.round(net / sampleTotal),
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin,
  };
}

/* ---- Return statistics table ---- */

export type Stat = {
  label: string;
  value: string;
  /** One-line plain-English definition, shown on hover. */
  note: string;
  /** Optional directional tint. Omit for neutral (ink) values. */
  tone?: "profit" | "loss";
};

/**
 * The full statistics block. Every figure is derived from the same trade
 * history and monthly-returns series the rest of analytics uses, so nothing
 * here can contradict the donut or the curves above it.
 */
/* ---- Risk analytics: drawdown episodes, ratios, volatility ---- */

/**
 * One daily equity series for ANY account — real balances for imports,
 * the seeded full-history curve for demos. Every risk metric below derives
 * from this single source, so an uploaded statement is automatically
 * consistent across the whole Risk tab.
 */
export function dailyEquityFor(account: Account): { date: Date; equity: number }[] {
  if (account.source === "html") return importedDailyEquity(account);
  return equitySeries("Max", account).map((p) => ({
    date: new Date(p.date),
    equity: p.equity,
  }));
}

export type DrawdownEpisode = {
  /** First day equity dropped below the prior peak. */
  start: Date;
  /** Deepest day of the episode. */
  trough: Date;
  /** Day a new high was made — null while still underwater. */
  recovered: Date | null;
  /** Max depth, negative percent. */
  depthPct: number;
  /** Max depth in currency. */
  depthAbs: number;
  /** Calendar days from start until recovery (or until the last data point). */
  days: number;
};

/** Peak-to-recovery drawdown episodes, deepest first. */
export function drawdownEpisodes(account: Account): DrawdownEpisode[] {
  const daily = dailyEquityFor(account);
  if (daily.length < 2) return [];

  const episodes: DrawdownEpisode[] = [];
  let peak = daily[0].equity;
  let cur: DrawdownEpisode | null = null;
  const lastDate = daily[daily.length - 1].date;

  for (const p of daily) {
    if (p.equity >= peak) {
      if (cur) {
        cur.recovered = p.date;
        cur.days = Math.round((p.date.getTime() - cur.start.getTime()) / 86_400_000);
        episodes.push(cur);
        cur = null;
      }
      peak = p.equity;
      continue;
    }
    const depthPct = ((p.equity - peak) / peak) * 100;
    const depthAbs = peak - p.equity;
    if (!cur) {
      cur = { start: p.date, trough: p.date, recovered: null, depthPct, depthAbs, days: 0 };
    }
    if (depthPct < cur.depthPct) {
      cur.depthPct = depthPct;
      cur.depthAbs = depthAbs;
      cur.trough = p.date;
    }
  }
  if (cur) {
    // Still underwater at the end of the data.
    cur.days = Math.round((lastDate.getTime() - cur.start.getTime()) / 86_400_000);
    episodes.push(cur);
  }
  return episodes.sort((a, b) => a.depthPct - b.depthPct);
}

export type RiskAnalytics = {
  maxDrawdownAbs: number;
  maxDrawdownPct: number;
  /** Mean max-depth across all drawdown episodes. */
  avgDrawdownPct: number;
  /** Mean episode length in days. */
  avgDrawdownDays: number;
  sortino: number;
  calmar: number;
  /** Annualised return over the whole series, percent. */
  cagrPct: number;
};

export function riskAnalytics(account: Account): RiskAnalytics {
  const daily = dailyEquityFor(account);
  const episodes = drawdownEpisodes(account);

  const rets: number[] = [];
  for (let i = 1; i < daily.length; i++) {
    const prev = daily[i - 1].equity;
    if (prev) rets.push((daily[i].equity - prev) / prev);
  }

  const mean = rets.reduce((a, r) => a + r, 0) / (rets.length || 1);
  // Downside deviation: only negative days penalise (Sortino's denominator).
  const downside = Math.sqrt(
    rets.reduce((a, r) => a + Math.min(0, r) ** 2, 0) / (rets.length || 1),
  );
  const sortino = downside > 0 ? (mean / downside) * Math.sqrt(252) : 0;

  const start = daily[0]?.equity ?? 0;
  const end = daily[daily.length - 1]?.equity ?? 0;
  const totalDays = daily.length > 1
    ? (daily[daily.length - 1].date.getTime() - daily[0].date.getTime()) / 86_400_000
    : 1;
  const cagrPct =
    start > 0 && totalDays > 0
      ? ((end / start) ** (365 / totalDays) - 1) * 100
      : 0;

  const maxDrawdownPct = episodes.length ? episodes[0].depthPct : 0;
  const maxDrawdownAbs = episodes.length
    ? Math.max(...episodes.map((e) => e.depthAbs))
    : 0;
  const calmar = maxDrawdownPct < 0 ? cagrPct / Math.abs(maxDrawdownPct) : 0;

  return {
    maxDrawdownAbs,
    maxDrawdownPct,
    avgDrawdownPct:
      episodes.reduce((a, e) => a + e.depthPct, 0) / (episodes.length || 1),
    avgDrawdownDays:
      episodes.reduce((a, e) => a + e.days, 0) / (episodes.length || 1),
    sortino,
    calmar,
    cagrPct,
  };
}

/** Cumulative return %, plus the worst episodes for band-shading the chart. */
export function returnComparison(account: Account) {
  const daily = dailyEquityFor(account);
  const start = daily[0]?.equity ?? 1;
  const points = daily.map((p) => ({
    date: p.date.toISOString().slice(0, 10),
    ret: ((p.equity - start) / start) * 100,
  }));
  const lastDate = daily[daily.length - 1]?.date;
  const bands = drawdownEpisodes(account)
    .slice(0, 5)
    .map((e) => ({
      from: e.start.toISOString().slice(0, 10),
      to: (e.recovered ?? lastDate).toISOString().slice(0, 10),
    }));
  return { points, bands };
}

export type EquityRiskPoint = {
  date: string;
  /** Cumulative return since the first day, in percent. */
  ret: number;
  /** Percent below the running equity peak — always <= 0. */
  dd: number;
};

export type StagnationPeriod = {
  from: string;
  to: string;
  days: number;
  ongoing: boolean;
};

/**
 * Everything the combined equity/underwater chart needs, on one aligned daily
 * axis so the two stacked panels share an x-domain exactly.
 *
 * `stagnations` are the five longest stretches without a new equity high —
 * peak date to the day that peak was exceeded, the last one left open-ended
 * (and counted) if the peak never was exceeded.
 */
export function equityRiskSeries(account: Account) {
  const daily = dailyEquityFor(account);
  const start = daily[0]?.equity ?? 1;

  const points: EquityRiskPoint[] = [];
  const highs: string[] = [];
  const runs: { fromIdx: number; toIdx: number; days: number; ongoing: boolean }[] = [];
  let peak = start;
  let peakIdx = 0;

  const dayGap = (a: number, b: number) =>
    Math.round(
      (daily[b].date.getTime() - daily[a].date.getTime()) / 86_400_000,
    );

  daily.forEach((p, i) => {
    if (p.equity > peak) {
      const days = dayGap(peakIdx, i);
      if (days > 0)
        runs.push({ fromIdx: peakIdx, toIdx: i, days, ongoing: false });
      peak = p.equity;
      peakIdx = i;
      if (i > 0) highs.push(p.date.toISOString().slice(0, 10));
    }
    points.push({
      date: p.date.toISOString().slice(0, 10),
      ret: ((p.equity - start) / start) * 100,
      dd: peak ? ((p.equity - peak) / peak) * 100 : 0,
    });
  });

  // The run still in progress counts too — a record-long flat patch that has
  // not ended yet is exactly the one worth showing.
  if (daily.length > 1 && peakIdx < daily.length - 1) {
    const days = dayGap(peakIdx, daily.length - 1);
    if (days > 0)
      runs.push({ fromIdx: peakIdx, toIdx: daily.length - 1, days, ongoing: true });
  }

  const stagnations: StagnationPeriod[] = runs
    .sort((a, b) => b.days - a.days)
    .slice(0, 5)
    .sort((a, b) => a.fromIdx - b.fromIdx)
    .map((r) => ({
      from: points[r.fromIdx].date,
      to: points[r.toIdx].date,
      days: r.days,
      ongoing: r.ongoing,
    }));

  const lastDate = daily[daily.length - 1]?.date;
  const bands = drawdownEpisodes(account)
    .slice(0, 5)
    .map((e) => ({
      from: e.start.toISOString().slice(0, 10),
      to: (e.recovered ?? lastDate).toISOString().slice(0, 10),
    }));

  return {
    points,
    bands,
    highs,
    stagnations,
    /** Endpoint-to-endpoint reference line, the reference chart's straight red line. */
    trend: points.length
      ? { from: points[0].ret, to: points[points.length - 1].ret }
      : null,
  };
}

/** Rolling 30-day volatility, annualised, in percent. */
export function rollingVolatility(account: Account, window = 30) {
  const daily = dailyEquityFor(account);
  const rets: { date: Date; r: number }[] = [];
  for (let i = 1; i < daily.length; i++) {
    const prev = daily[i - 1].equity;
    if (prev) rets.push({ date: daily[i].date, r: (daily[i].equity - prev) / prev });
  }
  const out: { date: string; vol: number }[] = [];
  for (let i = window; i < rets.length; i++) {
    const slice = rets.slice(i - window, i);
    const m = slice.reduce((a, x) => a + x.r, 0) / window;
    const sd = Math.sqrt(slice.reduce((a, x) => a + (x.r - m) ** 2, 0) / window);
    out.push({
      date: rets[i].date.toISOString().slice(0, 10),
      vol: Math.round(sd * Math.sqrt(252) * 100 * 100) / 100,
    });
  }
  return out;
}

export function returnStatistics(account: Account): Stat[] {
  const trades = tradeHistoryFor(account);
  const o = tradeOutcomes(account);
  const months = monthlyReturns(account);

  // Averages, extremes, duration.
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const avgWin = wins.reduce((a, t) => a + t.pnl, 0) / (wins.length || 1);
  const avgLoss =
    losses.reduce((a, t) => a + t.pnl, 0) / (losses.length || 1); // negative
  // Derive risk-reward from the very averages shown, so the table is
  // internally consistent (Average win ÷ Average loss === Risk-reward).
  const riskReward = avgWin / Math.abs(avgLoss || 1);
  const best = Math.max(...trades.map((t) => t.pnl));
  const worst = Math.min(...trades.map((t) => t.pnl));
  const avgDuration =
    trades.reduce((a, t) => a + t.durationHours, 0) / (trades.length || 1);

  // Streaks over the full history (winLossSequence caps at 120).
  let longestWin = 0;
  let longestLoss = 0;
  let run = 0;
  let runWin = true;
  for (const t of trades) {
    const win = t.pnl >= 0;
    if (win === runWin) run++;
    else {
      run = 1;
      runWin = win;
    }
    if (runWin) longestWin = Math.max(longestWin, run);
    else longestLoss = Math.max(longestLoss, run);
  }

  // Portfolio max drawdown: compound every month into an equity curve and
  // measure the deepest peak-to-trough. Recovery factor = net return ÷ maxDD.
  const flatMonths = months
    .flatMap((y) => y.months)
    .filter((m): m is MonthCell => m !== null);
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  for (const m of flatMonths) {
    equity *= 1 + m.ret / 100;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, (equity - peak) / peak);
  }
  const netReturn = (equity - 1) * 100;
  // Imported accounts have a real daily equity curve — measure drawdown there,
  // matching the underwater plot. Monthly compounding understates it (an
  // all-positive-months account can still dip hard intra-month).
  const maxDDPct =
    account.source === "html" ? importedMaxDrawdown(account) : maxDD * 100;

  // Recovery factor = net profit ÷ max drawdown, in the SAME units. For imports
  // use real dollars from the equity curve (the report's definition); dividing
  // return% by drawdown% — different bases — is what gave the absurd ~45.
  let recovery: number;
  if (account.source === "html") {
    const daily = importedDailyEquity(account);
    let pk = -Infinity;
    let ddAbs = 0;
    for (const p of daily) {
      pk = Math.max(pk, p.equity);
      ddAbs = Math.max(ddAbs, pk - p.equity);
    }
    const netProfit = account.equity - (account.startingBalance ?? 0);
    recovery = ddAbs > 0 ? netProfit / ddAbs : 0;
  } else {
    recovery = maxDDPct < 0 ? netReturn / Math.abs(maxDDPct) : 0;
  }

  // Monthly / yearly performance.
  const posMonths = flatMonths.filter((m) => m.ret > 0).length;
  const winningMonthsPct = Math.round((posMonths / flatMonths.length) * 100);
  const posYears = months.filter((y) => y.total > 0).length;
  const winningYearsPct = Math.round((posYears / months.length) * 100);

  const durationText =
    avgDuration >= 24
      ? `${(avgDuration / 24).toFixed(1)}d`
      : `${avgDuration.toFixed(1)}h`;

  return [
    {
      label: "Average win",
      value: money(Math.round(avgWin)),
      note: "Mean profit across all winning trades.",
      tone: "profit",
    },
    {
      label: "Average loss",
      value: money(Math.round(avgLoss)),
      note: "Mean loss across all losing trades.",
      tone: "loss",
    },
    {
      label: "Risk-reward ratio",
      value: `1 : ${riskReward.toFixed(2)}`,
      note: "Average win size for every 1 unit of average loss.",
    },
    {
      label: "Expectancy / trade",
      value: money(o.expectancy, { signed: true }),
      note: "Average profit or loss you can expect from any single trade.",
      tone: o.expectancy >= 0 ? "profit" : "loss",
    },
    {
      label: "Profit factor",
      value: o.profitFactor.toFixed(2),
      note: "Gross profit divided by gross loss. Above 1.0 is profitable.",
    },
    {
      label: "Maximum drawdown",
      value: `−${Math.abs(maxDDPct).toFixed(1)}%`,
      note: "Largest peak-to-trough fall in account equity.",
      tone: "loss",
    },
    {
      label: "Recovery factor",
      value: recovery.toFixed(2),
      note: "Net return divided by max drawdown. Higher recovers losses faster.",
    },
    {
      label: "Best trade",
      value: money(best, { signed: true }),
      note: "Largest single winning trade.",
      tone: "profit",
    },
    {
      label: "Worst trade",
      value: money(worst, { signed: true }),
      note: "Largest single losing trade.",
      tone: "loss",
    },
    {
      label: "Avg trade duration",
      value: durationText,
      note: "Average time a position is held before closing.",
    },
    {
      label: "Max winning streak",
      value: `${longestWin}`,
      note: "Longest run of consecutive winning trades.",
      tone: "profit",
    },
    {
      label: "Max losing streak",
      value: `${longestLoss}`,
      note: "Longest run of consecutive losing trades.",
      tone: "loss",
    },
    {
      label: "Winning months",
      value: `${winningMonthsPct}%`,
      note: "Share of calendar months that closed positive.",
    },
    {
      label: "Winning years",
      value: `${winningYearsPct}%`,
      note: "Share of calendar years that closed positive.",
    },
  ];
}

/* ---- Performance by weekday / month / year ---- */

export type Breakdown = {
  label: string;
  pnl: number;
  trades: number;
  /** Winning trades in the bucket (pnl > 0), for hover stats. */
  wins: number;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function byWeekday(account: Account): Breakdown[] {
  const acc = WEEKDAYS.map((label) => ({ label, pnl: 0, trades: 0, wins: 0 }));
  for (const t of tradeHistoryFor(account)) {
    const i = t.date.getDay() - 1; // Mon = 0
    if (i < 0 || i > 4) continue;
    acc[i].pnl += t.pnl;
    acc[i].trades++;
    if (t.pnl > 0) acc[i].wins++;
  }
  return acc;
}

export function byMonth(account: Account): Breakdown[] {
  const acc = MONTHS.map((label) => ({ label, pnl: 0, trades: 0, wins: 0 }));
  for (const t of tradeHistoryFor(account)) {
    const i = t.date.getMonth();
    acc[i].pnl += t.pnl;
    acc[i].trades++;
    if (t.pnl > 0) acc[i].wins++;
  }
  return acc;
}

export function byYear(account: Account): Breakdown[] {
  const map = new Map<number, Breakdown>();
  for (const t of tradeHistoryFor(account)) {
    const y = t.date.getFullYear();
    if (!map.has(y)) map.set(y, { label: String(y), pnl: 0, trades: 0, wins: 0 });
    const b = map.get(y)!;
    b.pnl += t.pnl;
    b.trades++;
    if (t.pnl > 0) b.wins++;
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ */
/* Monthly returns                                                     */
/* ------------------------------------------------------------------ */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type MonthCell = {
  /** Percentage return for the month. */
  ret: number;
  /** Max drawdown within the month — always <= 0. */
  dd: number;
};

export type YearReturns = {
  year: number;
  /** null = month has not happened yet, or predates the account. */
  months: (MonthCell | null)[];
  total: number;
};

/**
 * Monthly percentage returns from the account's inception year through the
 * current year, each with its intra-month max drawdown. Months in the future —
 * and months before the account opened — are null so the grid can render them
 * as empty rather than as 0%.
 */
export function monthlyReturns(account: Account): YearReturns[] {
  if (account.source === "html") return importedMonthlyReturns(account);
  const rand = seeded(hash(account.id) + 89);
  const startYear = account.since;
  const endYear = TODAY.getFullYear();
  const currentMonth = TODAY.getMonth();

  const rows: YearReturns[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const months = MONTHS.map((_, m): MonthCell | null => {
      if (year === endYear && m > currentMonth) return null;
      // Slight positive drift with genuine losing months.
      const ret = Math.round((rand() - 0.4) * 14 * 100) / 100;
      // A month's worst dip is at least as deep as any loss it closed with.
      const dd =
        -Math.round((Math.max(0, -ret) + 0.4 + rand() * 3.2) * 100) / 100;
      return { ret, dd };
    });
    // Compounded annual return from the monthly figures.
    const total =
      (months.reduce<number>((acc, v) => acc * (1 + (v?.ret ?? 0) / 100), 1) -
        1) *
      100;
    rows.push({ year, months, total: Math.round(total * 100) / 100 });
  }
  return rows.reverse(); // Most recent year first.
}
