import type { Account, HistTrade } from "@/lib/data";

/**
 * Parses trading history out of an uploaded HTML file. Two formats:
 *
 * 1. MetaTrader 4/5 statements and Strategy Tester reports (dollar P&L).
 * 2. Spreadsheet journals exported from Google Sheets / Excel as HTML — one
 *    sheet per file — recognised by their column names (Asset / Order /
 *    Result / Return %). These record each trade as a signed percent return,
 *    not dollars, so their trades carry the percent through the parse and
 *    accountFromParse converts to money against the balance the user enters.
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
      /** Journal sheets store each trade's pnl as a PERCENT return, converted
          to money only in accountFromParse (fixed % of starting balance). */
      journal?: boolean;
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
          // Position size: MT5 Deals call it "Volume", MT4 statements "Size".
          volume: lower.findIndex(
            (c) => c === "volume" || c === "size" || c === "lots",
          ),
        },
      };
    }
  }
  return null;
}

export function parseStatement(html: string, fileName?: string): ParseResult {
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

      // Position size — "1.93" or MT4's "1.93 / 1.93" partial-close form.
      let lots: number | undefined;
      if (cols.volume >= 0 && row[cols.volume]) {
        const v = parseMoney(row[cols.volume].split("/")[0]);
        if (v != null && v > 0) lots = v;
      }

      trades.push({
        id: id++,
        date,
        pair: symbol,
        side,
        pnl: Math.round(pnl * 100) / 100,
        durationHours,
        lots,
        commission: Math.round(commission * 100) / 100,
        swap: Math.round(swap * 100) / 100,
      });
    }

    if (trades.length && (!best || trades.length > best.trades.length)) {
      best = { trades, detectedBalance };
    }
  }

  // No MT4/MT5 table — try the spreadsheet-journal shape before giving up.
  if (!best || best.trades.length === 0) {
    const journal = parseJournalRows(rows, fileName);
    if (journal) return journal;
    return {
      ok: false,
      error:
        "No trades found. Upload a MetaTrader 4/5 statement, a Strategy Tester report, or a journal sheet with Asset / Order / Result / Return columns.",
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

/** "27/11" or "8/1" — day/month with no year. */
const JOURNAL_DATE_RE = /^(\d{1,2})\/(\d{1,2})$/;

/**
 * Spreadsheet journals (Google Sheets HTML export). Header-driven like the MT
 * path: the trades table is found by its column names, values read by name.
 * The year is not in the date column — journals carry it in a Code column as
 * M(M)YY ("1125" = Nov 2025, "126" = Jan 2026); rows without a valid code
 * inherit the last known year and roll it over when the month wraps. Sheets
 * with an empty Code column (e.g. a per-year sheet named "2024") get their
 * year from the file name instead.
 */
function parseJournalRows(rows: Row[], fileName?: string): ParseResult | null {
  const headerIdx = rows.findIndex((r) => {
    const lower = r.map((c) => c.toLowerCase());
    return (
      lower.includes("asset") &&
      lower.includes("order") &&
      lower.includes("result") &&
      lower.some((c) => c.startsWith("return"))
    );
  });
  if (headerIdx < 0) return null;

  const lower = rows[headerIdx].map((c) => c.toLowerCase());
  const col = {
    date: lower.findIndex((c) => c === "open date" || c === "date"),
    time: lower.findIndex((c) => c === "open time" || c === "time" || c === "tijd"),
    code: lower.indexOf("code"),
    asset: lower.indexOf("asset"),
    order: lower.indexOf("order"),
    result: lower.indexOf("result"),
    ret: lower.findIndex((c) => c.startsWith("return")),
  };
  if (col.date < 0) return null;

  const trades: HistTrade[] = [];
  let id = 0;
  // A year in the file name ("2024.html") seeds the anchor for sheets whose
  // Code column is empty; an in-row code still overrides it.
  const nameYear = fileName?.match(/\b(20\d{2})\b/);
  let year: number | null = nameYear ? +nameYear[1] : null;
  let prevMonth = 0;
  let skippedForYear = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= col.ret) continue;

    const dm = (row[col.date] ?? "").match(JOURNAL_DATE_RE);
    if (!dm) continue;
    const day = +dm[1];
    const month = +dm[2];
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    // Sheets error cells ("#VERW!", "#REF!") and stray notes are not trades.
    const asset = (row[col.asset] ?? "").trim();
    if (!/^[a-z0-9]{4,10}$/i.test(asset) || /^\d+$/.test(asset)) continue;

    const order = (row[col.order] ?? "").toLowerCase().trim();
    if (order !== "buy" && order !== "sell") continue;

    if (!(row[col.result] ?? "").trim()) continue; // still open / unfinished

    const pct = parseMoney(row[col.ret] ?? "");
    if (pct == null || Math.abs(pct) > 100) continue;

    // Year from the M(M)YY code when present and sane.
    const codeMatch =
      col.code >= 0 ? (row[col.code] ?? "").match(/^(\d{1,2})(\d{2})$/) : null;
    if (codeMatch && +codeMatch[1] >= 1 && +codeMatch[1] <= 12) {
      year = 2000 + +codeMatch[2];
    } else if (year != null && prevMonth - month >= 6) {
      // Rows are chronological, so a big backwards jump (Dec -> Jan) is a new
      // year. Small dips are data-entry typos ("25/5" between April rows) and
      // must NOT roll the year, or one typo shifts the rest of the sheet.
      year += 1;
    }
    if (year == null) {
      skippedForYear++; // no anchor yet — can't date this row
      continue;
    }
    prevMonth = month;

    let hh = 0;
    let mm = 0;
    const tm =
      col.time >= 0 ? (row[col.time] ?? "").match(/^(\d{1,2}):(\d{2})$/) : null;
    if (tm) {
      hh = +tm[1];
      mm = +tm[2];
    }

    trades.push({
      id: id++,
      date: new Date(year, month - 1, day, hh, mm),
      pair: asset.toUpperCase(),
      side: order === "buy" ? "Long" : "Short",
      // PERCENT, not money — converted in accountFromParse.
      pnl: Math.round(pct * 100) / 100,
      durationHours: 0,
      commission: 0,
      swap: 0,
    });
  }

  if (!trades.length) {
    // The journal table was there, the trades were there — only the year was
    // missing. Say exactly that instead of the generic "no trades found".
    if (skippedForYear > 0) {
      return {
        ok: false,
        error:
          "Found trades but no year: the dates are day/month only. Put the year in the file name (e.g. 2024.html) or fill the Code column (1124 = Nov 2024).",
      };
    }
    return null;
  }

  trades.sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    ok: true,
    trades,
    firstDate: trades[0].date,
    lastDate: trades[trades.length - 1].date,
    // Percent here too; accountFromParse recomputes in money.
    netPnl: Math.round(trades.reduce((a, t) => a + t.pnl, 0) * 100) / 100,
    symbols: [...new Set(trades.map((t) => t.pair))],
    detectedBalance: null,
    journal: true,
  };
}

/** Builds a ready-to-store Account from a successful parse. */
export function accountFromParse(
  opts: { name: string; startingBalance: number; riskPerTrade: number },
  res: Extract<ParseResult, { ok: true }>,
): Account {
  // The report's own starting balance wins when present — it's exact.
  const startingBalance = res.detectedBalance ?? opts.startingBalance;

  // Journal trades arrive as percent returns; each becomes a fixed share of
  // the starting balance (the user's chosen basis — not compounded).
  let trades = res.trades;
  let netPnl = res.netPnl;
  if (res.journal) {
    trades = res.trades.map((t) => ({
      ...t,
      pnl: Math.round(startingBalance * t.pnl) / 100,
    }));
    netPnl =
      Math.round(trades.reduce((a, t) => a + t.pnl, 0) * 100) / 100;
  }
  return {
    id: `html-${Date.now().toString(36)}`,
    name: opts.name.trim() || "Imported account",
    broker: "HTML statement",
    since: res.firstDate.getFullYear(),
    equity: Math.round(startingBalance + netPnl),
    source: "html",
    trades,
    startingBalance,
    riskPerTrade: opts.riskPerTrade,
    hasBenchmark: false,
    updatedAt: new Date().toISOString(),
  };
}
