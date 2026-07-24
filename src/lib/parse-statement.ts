import type { Account, HistTrade } from "@/lib/data";

/**
 * Parses a MetaTrader 4/5 HTML statement into closed trades.
 *
 * It is deliberately heuristic rather than tied to one broker's exact export:
 * it scans every table row, treats any row with a "buy"/"sell" type cell and a
 * trailing profit number as a closed trade, and reads the symbol, close time,
 * lot size and profit from that row. This handles the common MT4 "Statement"
 * and MT5 "Report" layouts and most broker variants.
 *
 * If a real statement doesn't parse, the row heuristic below is the place to
 * adjust — share a sample and it can be tuned to that broker.
 */

export type ParseResult =
  | {
      ok: true;
      trades: HistTrade[];
      firstDate: Date;
      lastDate: Date;
      netPnl: number;
      symbols: string[];
    }
  | { ok: false; error: string };

const DATE_RE = /(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/;

function parseMtDate(text: string): Date | null {
  const m = text.match(DATE_RE);
  if (!m) return null;
  const [, y, mo, d, hh = "0", mm = "0", ss = "0"] = m;
  return new Date(+y, +mo - 1, +d, +hh, +mm, +ss);
}

/** Broker profit figures: "1 234.56", "1,234.56", "-50.00", "(50.00)". */
function parseMoney(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || t.includes("-") || t.includes("−");
  const cleaned = t.replace(/[()\s,]/g, "").replace(/[−-]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return negative ? -n : n;
}

function looksLikeSymbol(text: string): boolean {
  const t = text.trim();
  return (
    /^[A-Za-z][A-Za-z0-9._]{2,11}$/.test(t) &&
    !/^(buy|sell|balance|credit|deposit|withdrawal)$/i.test(t)
  );
}

export function parseStatement(html: string): ParseResult {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return { ok: false, error: "This file could not be read as HTML." };
  }

  const trades: HistTrade[] = [];
  const symbols = new Set<string>();
  let id = 0;

  for (const row of Array.from(doc.querySelectorAll("tr"))) {
    const cells = Array.from(row.querySelectorAll("td")).map((c) =>
      (c.textContent ?? "").replace(/ /g, " ").trim(),
    );
    if (cells.length < 5) continue;

    const typeIndex = cells.findIndex((c) => /^(buy|sell)$/i.test(c));
    if (typeIndex === -1) continue;

    const side: "Long" | "Short" = /buy/i.test(cells[typeIndex])
      ? "Long"
      : "Short";

    // Profit is the last cell that parses as money (MT puts it last).
    let pnl: number | null = null;
    for (let i = cells.length - 1; i > typeIndex; i--) {
      const v = parseMoney(cells[i]);
      if (v !== null) {
        pnl = v;
        break;
      }
    }
    if (pnl === null) continue;

    // Dates in the row: first = open, last = close.
    const dates = cells.map(parseMtDate).filter((d): d is Date => d !== null);
    if (!dates.length) continue;
    const closeDate = dates[dates.length - 1];
    const openDate = dates[0];
    const durationHours =
      dates.length > 1
        ? Math.max(0, (closeDate.getTime() - openDate.getTime()) / 3_600_000)
        : 0;

    // Symbol: first symbol-shaped cell after the type column, else before it.
    const symbol =
      cells.slice(typeIndex + 1).find(looksLikeSymbol) ??
      cells.slice(0, typeIndex).reverse().find(looksLikeSymbol) ??
      "—";

    const upper = symbol.toUpperCase();
    symbols.add(upper);
    trades.push({
      id: id++,
      date: closeDate,
      pair: upper,
      side,
      pnl: Math.round(pnl * 100) / 100,
      durationHours: Math.round(durationHours * 10) / 10,
    });
  }

  if (trades.length === 0) {
    return {
      ok: false,
      error:
        "No trades found. Expected a MetaTrader 4 or 5 HTML statement with a closed-trades table.",
    };
  }

  trades.sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    ok: true,
    trades,
    firstDate: trades[0].date,
    lastDate: trades[trades.length - 1].date,
    netPnl: Math.round(trades.reduce((a, t) => a + t.pnl, 0) * 100) / 100,
    symbols: [...symbols],
  };
}

/** Builds a ready-to-store Account from a successful parse. */
export function accountFromParse(
  opts: { name: string; startingBalance: number; riskPerTrade: number },
  res: Extract<ParseResult, { ok: true }>,
): Account {
  return {
    id: `html-${Date.now().toString(36)}`,
    name: opts.name.trim() || "Imported account",
    broker: "HTML statement",
    since: res.firstDate.getFullYear(),
    equity: Math.round(opts.startingBalance + res.netPnl),
    source: "html",
    trades: res.trades,
    startingBalance: opts.startingBalance,
    riskPerTrade: opts.riskPerTrade,
    hasBenchmark: false,
  };
}
