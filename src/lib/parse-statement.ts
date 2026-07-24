import type { Account, HistTrade } from "@/lib/data";

/**
 * Parses a MetaTrader 4/5 HTML statement or Strategy Tester report into closed
 * trades.
 *
 * It is header-driven, not position-driven: it finds the trades table by its
 * column names (a "Profit" column plus a "Type" column) and reads each field
 * by name. This handles both layouts from one code path:
 *
 *  - MT5 (Deals table): has a "Direction" column (in/out). Realized P&L is on
 *    the "out" deals, in the Profit column — NOT the last cell, which is the
 *    running Balance. Each closed position is one "out" deal.
 *  - MT4 (Statement): no Direction column. Each buy/sell row is a full closed
 *    trade; profit is read from the Profit column.
 *
 * Encoding is handled by the caller (MT5 often saves reports as UTF-16); this
 * function works on an already-decoded string.
 */

export type ParseResult =
  | {
      ok: true;
      trades: HistTrade[];
      firstDate: Date;
      lastDate: Date;
      netPnl: number;
      symbols: string[];
      /** Starting balance read from the report, if present. */
      detectedBalance: number | null;
    }
  | { ok: false; error: string };

const DATE_RE = /(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/;

function parseMtDate(text: string): Date | null {
  const m = text.match(DATE_RE);
  if (!m) return null;
  const [, y, mo, d, hh = "0", mm = "0", ss = "0"] = m;
  return new Date(+y, +mo - 1, +d, +hh, +mm, +ss);
}

/** Broker figures: "1 991.45", "1,234.56", "-265.13", "1.234,56", nbsp seps. */
function parseMoney(text: string): number | null {
  const t = text.replace(/ /g, " ").trim();
  if (!t || t === "-") return null;
  const neg = /^[-−(]/.test(t);
  let c = t.replace(/[−()\s]/g, "").replace(/^-/, "");
  if (c.includes(",") && c.includes(".")) {
    // Both present: the last separator is the decimal point.
    c = c.lastIndexOf(",") > c.lastIndexOf(".") ? c.replace(/\./g, "").replace(",", ".") : c.replace(/,/g, "");
  } else if (c.includes(",")) {
    // Comma only: decimal if it looks like "123,45", else thousands.
    c = /,\d{1,2}$/.test(c) ? c.replace(",", ".") : c.replace(/,/g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(c)) return null;
  const n = parseFloat(c);
  return neg ? -n : n;
}

/** Strip a broker suffix like ".s" / ".pro" — "GBPJPY.s" -> "GBPJPY". */
function cleanSymbol(sym: string): string {
  return sym.replace(/\.[a-z0-9]{1,4}$/i, "").toUpperCase() || sym.toUpperCase();
}

type Row = string[];

function findHeader(rows: Row[], from: number) {
  for (let i = from; i < rows.length; i++) {
    const lower = rows[i].map((c) => c.toLowerCase());
    const profit = lower.indexOf("profit");
    const type = lower.indexOf("type");
    if (profit >= 0 && type >= 0) {
      return {
        index: i,
        cols: {
          type,
          profit,
          commission: lower.indexOf("commission"),
          swap: lower.indexOf("swap"),
          direction: lower.indexOf("direction"),
          symbol: lower.findIndex((c) => c === "symbol" || c === "item"),
          time: lower.findIndex((c) => c === "time" || c === "close time"),
          balance: lower.indexOf("balance"),
        },
      };
    }
  }
  return null;
}

export function parseStatement(html: string): ParseResult {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return { ok: false, error: "This file could not be read as HTML." };
  }

  const rows: Row[] = Array.from(doc.querySelectorAll("tr")).map((r) =>
    Array.from(r.querySelectorAll("td, th")).map((c) =>
      (c.textContent ?? "").replace(/\s+/g, " ").trim(),
    ),
  );

  // A report can contain several tables (Orders, Deals). Parse every header
  // that has a Profit column and keep whichever yields the most trades.
  let best: {
    trades: HistTrade[];
    detectedBalance: number | null;
  } | null = null;

  let search = 0;
  for (;;) {
    const header = findHeader(rows, search);
    if (!header) break;
    search = header.index + 1;

    const { cols } = header;
    const mt5 = cols.direction >= 0;
    const trades: HistTrade[] = [];
    let detectedBalance: number | null = null;
    let id = 0;
    // FIFO queue of entry ("in") deal times per symbol, to pair with exits and
    // derive holding duration.
    const openTimes = new Map<string, number[]>();

    for (let i = header.index + 1; i < rows.length; i++) {
      const row = rows[i];
      // Stop at the next header (a fresh section).
      if (row.some((c) => c.toLowerCase() === "profit")) break;
      if (row.length <= cols.profit) continue;

      const typeCell = (row[cols.type] ?? "").toLowerCase().trim();

      // Starting balance from the initial "balance" deposit deal (MT5).
      if (typeCell === "balance") {
        const b = parseMoney(row[cols.profit]);
        if (b != null && detectedBalance == null) detectedBalance = b;
        continue;
      }

      const symbol =
        cols.symbol >= 0 && row[cols.symbol] ? cleanSymbol(row[cols.symbol]) : "—";
      const rowTime = cols.time >= 0 ? parseMtDate(row[cols.time] ?? "") : null;

      // MT5: only closing deals carry realized P&L; record entry times to pair.
      // MT4: every buy/sell row is a complete closed trade.
      if (mt5) {
        const dir = (row[cols.direction] ?? "").toLowerCase().trim();
        if (dir === "in") {
          if (rowTime) {
            const q = openTimes.get(symbol) ?? [];
            q.push(rowTime.getTime());
            openTimes.set(symbol, q);
          }
          continue;
        }
        if (dir !== "out") continue;
      } else if (typeCell !== "buy" && typeCell !== "sell") {
        continue;
      }

      const gross = parseMoney(row[cols.profit]);
      if (gross == null) continue;
      // Net realized P&L = profit + commission + swap. Omitting swap/commission
      // overstates the equity curve (they can total thousands over a history).
      const commission =
        cols.commission >= 0 ? (parseMoney(row[cols.commission]) ?? 0) : 0;
      const swap = cols.swap >= 0 ? (parseMoney(row[cols.swap]) ?? 0) : 0;
      const pnl = gross + commission + swap;

      const date =
        rowTime ??
        row.map(parseMtDate).filter((d): d is Date => d !== null).pop() ??
        null;
      if (!date) continue;

      // Holding time: pair this exit with the oldest open entry for the symbol.
      let durationHours = 0;
      if (mt5) {
        const q = openTimes.get(symbol);
        if (q && q.length) {
          const inMs = q.shift() as number;
          durationHours = Math.round(Math.max(0, (date.getTime() - inMs) / 3_600_000) * 10) / 10;
        }
      }

      // MT5 "out" deal type is the closing side; the position was the opposite.
      const side: "Long" | "Short" = mt5
        ? typeCell === "sell"
          ? "Long"
          : "Short"
        : typeCell === "buy"
          ? "Long"
          : "Short";

      trades.push({
        id: id++,
        date,
        pair: symbol,
        side,
        pnl: Math.round(pnl * 100) / 100,
        durationHours,
      });
    }

    if (trades.length && (!best || trades.length > best.trades.length)) {
      best = { trades, detectedBalance };
    }
  }

  if (!best || best.trades.length === 0) {
    return {
      ok: false,
      error:
        "No trades found. Upload a MetaTrader 4/5 statement or Strategy Tester report that includes a closed-trades table.",
    };
  }

  const trades = best.trades.sort((a, b) => a.date.getTime() - b.date.getTime());
  const symbols = [...new Set(trades.map((t) => t.pair))];
  return {
    ok: true,
    trades,
    firstDate: trades[0].date,
    lastDate: trades[trades.length - 1].date,
    netPnl: Math.round(trades.reduce((a, t) => a + t.pnl, 0) * 100) / 100,
    symbols,
    detectedBalance: best.detectedBalance,
  };
}

/** Builds a ready-to-store Account from a successful parse. */
export function accountFromParse(
  opts: { name: string; startingBalance: number; riskPerTrade: number },
  res: Extract<ParseResult, { ok: true }>,
): Account {
  // The report's own starting balance wins when present — it's exact.
  const startingBalance = res.detectedBalance ?? opts.startingBalance;
  return {
    id: `html-${Date.now().toString(36)}`,
    name: opts.name.trim() || "Imported account",
    broker: "HTML statement",
    since: res.firstDate.getFullYear(),
    equity: Math.round(startingBalance + res.netPnl),
    source: "html",
    trades: res.trades,
    startingBalance,
    riskPerTrade: opts.riskPerTrade,
    hasBenchmark: false,
  };
}
