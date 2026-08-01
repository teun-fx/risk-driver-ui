import type { Account, HistTrade, JournalBasis } from "@/lib/data";

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

/**
 * A row the parser read successfully but doesn't trust — e.g. a date whose
 * month disagrees with both neighbours ("25/5" sitting between April rows).
 * Never auto-corrected: the import preview asks the user what to do, and
 * accountFromParse applies their answer per issue.
 */
export type ImportIssue = {
  id: string;
  /** The date exactly as it appears in the sheet, e.g. "25/5". */
  rawDate: string;
  pair: string;
  /** The trade's percent return (journal) — shown so the row is recognisable. */
  pct: number;
  /** Dates of the surrounding rows, e.g. "24/4" and "29/4". */
  prevDate: string;
  nextDate: string;
  /** The correction we'd suggest, e.g. "25/4". */
  suggestedDate: string;
  /** 1-based month of the suggestion. */
  suggestedMonth: number;
};

/** What the user chose for one flagged row. */
export type IssueResolution = "fix" | "keep" | "skip";

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
      /** Suspicious rows for the user to confirm in the import preview. */
      issues?: ImportIssue[];
      /** Rows that were skipped, with the reason — shown in the preview so
          "56 trades" never silently means "56 of 61". */
      skipped?: { open: number; unreadable: number };
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

/**
 * CSV / TSV / semicolon-separated text into rows. Handles quoted fields
 * (Google Sheets wraps Dutch decimals: "1,20") including escaped quotes.
 * The delimiter is whichever of , ; \t splits the header into the most
 * columns — Dutch Excel exports use semicolons, Sheets uses commas.
 */
function parseDelimited(text: string): Row[] {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  const delim = [",", ";", "\t"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: Row[] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

export function parseStatement(text: string, fileName?: string): ParseResult {
  // CSV route: by extension, or when the content plainly isn't an HTML table.
  const isCsv =
    /\.(csv|tsv|txt)$/i.test(fileName ?? "") || !/<\s*(table|tr)[\s>]/i.test(text);

  let rows: Row[];
  if (isCsv) {
    rows = parseDelimited(text);
  } else {
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(text, "text/html");
    } catch {
      return { ok: false, error: "This file could not be read as HTML." };
    }
    rows = Array.from(doc.querySelectorAll("tr")).map((r) =>
      Array.from(r.querySelectorAll("td, th")).map((c) =>
        (c.textContent ?? "").replace(/\s+/g, " ").trim(),
      ),
    );
  }

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
        "No trades found. Upload a MetaTrader 4/5 statement, a Strategy Tester report, or a journal export (HTML or CSV) with Asset / Order / Result / Return columns.",
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

  /* Pass 1 — collect candidate rows without dating them yet. Detecting typos
     needs the row's neighbours, so dating happens after the full scan. */
  type Candidate = {
    raw: string;
    day: number;
    month: number;
    codeYear: number | null;
    asset: string;
    order: string;
    pct: number;
    hh: number;
    mm: number;
  };
  const cands: Candidate[] = [];
  let open = 0;
  let unreadable = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= col.ret) continue;

    const raw = (row[col.date] ?? "").trim();
    const dm = raw.match(JOURNAL_DATE_RE);
    if (!dm) continue;
    const day = +dm[1];
    const month = +dm[2];
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    // Sheets error cells ("#VERW!", "#REF!") and stray notes are not trades.
    const asset = (row[col.asset] ?? "").trim();
    if (!/^[a-z0-9]{4,10}$/i.test(asset) || /^\d+$/.test(asset)) continue;

    const order = (row[col.order] ?? "").toLowerCase().trim();
    if (order !== "buy" && order !== "sell") continue;

    if (!(row[col.result] ?? "").trim()) {
      open++; // still open / unfinished — a dated row without an outcome
      continue;
    }

    const pct = parseMoney(row[col.ret] ?? "");
    if (pct == null || Math.abs(pct) > 100) {
      unreadable++;
      continue;
    }

    const codeMatch =
      col.code >= 0 ? (row[col.code] ?? "").match(/^(\d{1,2})(\d{2})$/) : null;
    const codeYear =
      codeMatch && +codeMatch[1] >= 1 && +codeMatch[1] <= 12
        ? 2000 + +codeMatch[2]
        : null;

    let hh = 0;
    let mm = 0;
    const tm =
      col.time >= 0 ? (row[col.time] ?? "").match(/^(\d{1,2}):(\d{2})$/) : null;
    if (tm) {
      hh = +tm[1];
      mm = +tm[2];
    }

    cands.push({ raw, day, month, codeYear, asset, order, pct, hh, mm });
  }

  /* Pass 2 — flag rows whose month disagrees with BOTH neighbours while the
     neighbours agree with each other ("25/5" between "24/4" and "29/4" is a
     typo for "25/4"; a real single-trade month has differing neighbours and
     is left alone). Flagged rows keep their literal date — the import
     preview asks the user, and accountFromParse applies the answer. */
  const flagged = new Map<number, string>(); // candidate index -> issue id
  const issues: ImportIssue[] = [];
  for (let i = 1; i < cands.length - 1; i++) {
    const prev = cands[i - 1];
    const cur = cands[i];
    const next = cands[i + 1];
    if (cur.month !== prev.month && prev.month === next.month) {
      const iid = `row-${i}`;
      flagged.set(i, iid);
      issues.push({
        id: iid,
        rawDate: cur.raw,
        pair: cur.asset.toUpperCase(),
        pct: Math.round(cur.pct * 100) / 100,
        prevDate: prev.raw,
        nextDate: next.raw,
        suggestedDate: `${cur.day}/${prev.month}`,
        suggestedMonth: prev.month,
      });
    }
  }

  /* Pass 3 — anchor years and build trades. Flagged rows are excluded from
     the rollover bookkeeping so one typo can't shift the rest of the sheet. */
  const trades: HistTrade[] = [];
  let id = 0;
  // A year in the file name ("2024.html") seeds the anchor for sheets whose
  // Code column is empty; an in-row code still overrides it.
  const nameYear = fileName?.match(/\b(20\d{2})\b/);
  let year: number | null = nameYear ? +nameYear[1] : null;
  let prevMonth = 0;
  let skippedForYear = 0;

  cands.forEach((c, i) => {
    if (c.codeYear != null) {
      year = c.codeYear;
    } else if (year != null && !flagged.has(i) && prevMonth - c.month >= 6) {
      // Rows are chronological, so a big backwards jump (Dec -> Jan) is a
      // new year. Small dips are data-entry typos and never roll the year.
      year += 1;
    }
    if (year == null) {
      skippedForYear++; // no anchor yet — can't date this row
      return;
    }
    if (!flagged.has(i)) prevMonth = c.month;

    const rounded = Math.round(c.pct * 100) / 100;
    trades.push({
      id: id++,
      date: new Date(year, c.month - 1, c.day, c.hh, c.mm),
      pair: c.asset.toUpperCase(),
      side: c.order === "buy" ? "Long" : "Short",
      // PERCENT, not money — converted per basis in accountFromParse. The raw
      // percent also rides along in pctReturn so the basis can be switched
      // later without re-uploading the file.
      pnl: rounded,
      pctReturn: rounded,
      durationHours: 0,
      commission: 0,
      swap: 0,
      issueId: flagged.get(i),
    });
  });

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
    issues: issues.length ? issues : undefined,
    skipped: open || unreadable ? { open, unreadable } : undefined,
  };
}

/**
 * Recomputes a journal account's money P&L from the raw percents under the
 * given basis. Pure — returns a new Account — so the UI can flip between the
 * two readings of the same sheet without re-uploading anything.
 *
 *  - "compounded": each percent applies to the equity at that moment, the way
 *    the money would actually have grown. Monthly returns measured on the
 *    equity curve then match the sheet's percents exactly.
 *  - "fixed": each percent is worth the same dollars forever (percent of the
 *    STARTING balance). Simple, but a late +1% is the same $ as an early one.
 */
export function withJournalBasis(
  account: Account,
  basis: JournalBasis,
): Account {
  const start = account.startingBalance ?? 0;
  const ordered = [...(account.trades ?? [])].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  let bal = start;
  const trades = ordered.map((t) => {
    const pct = t.pctReturn ?? 0;
    const pnl =
      basis === "compounded"
        ? Math.round(bal * pct) / 100
        : Math.round(start * pct) / 100;
    bal += pnl;
    return { ...t, pnl };
  });

  return {
    ...account,
    trades,
    equity: Math.round(bal),
    basis,
  };
}

/** Builds a ready-to-store Account from a successful parse. */
export function accountFromParse(
  opts: { name: string; startingBalance: number; riskPerTrade: number },
  res: Extract<ParseResult, { ok: true }>,
  /** Journal sheets only: how percents become money. */
  basis: JournalBasis = "compounded",
  /** The user's answer per flagged row ("fix" = use the suggested date).
      Unanswered issues default to "fix" — the suggestion is what the sheet's
      own monthly totals imply, and the preview shows it before connecting. */
  resolutions?: Record<string, IssueResolution>,
): Account {
  // The report's own starting balance wins when present — it's exact.
  const startingBalance = res.detectedBalance ?? opts.startingBalance;

  // Apply the per-issue choices, then drop the issue tags — they're an
  // import-time concept and must not be stored on the account.
  const byId = new Map((res.issues ?? []).map((iss) => [iss.id, iss]));
  const trades: HistTrade[] = [];
  for (const t of res.trades) {
    if (!t.issueId) {
      trades.push(t);
      continue;
    }
    const issue = byId.get(t.issueId);
    const choice = resolutions?.[t.issueId] ?? "fix";
    if (choice === "skip") continue;
    const date =
      choice === "fix" && issue
        ? new Date(
            t.date.getFullYear(),
            issue.suggestedMonth - 1,
            t.date.getDate(),
            t.date.getHours(),
            t.date.getMinutes(),
          )
        : t.date;
    trades.push({ ...t, date, issueId: undefined });
  }
  trades.sort((a, b) => a.date.getTime() - b.date.getTime());
  const netPnl =
    Math.round(trades.reduce((a, t) => a + t.pnl, 0) * 100) / 100;

  const account: Account = {
    id: `html-${Date.now().toString(36)}`,
    name: opts.name.trim() || "Imported account",
    broker: "HTML statement",
    since: (trades[0]?.date ?? res.firstDate).getFullYear(),
    equity: Math.round(startingBalance + netPnl),
    source: "html",
    trades,
    startingBalance,
    riskPerTrade: opts.riskPerTrade,
    hasBenchmark: false,
    updatedAt: new Date().toISOString(),
  };

  // Journal trades arrive as percent returns; convert under the chosen basis.
  if (res.journal) {
    account.journal = true;
    return withJournalBasis(account, basis);
  }
  return account;
}
