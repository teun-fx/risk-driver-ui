"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CandlestickChart,
  FileText,
  LineChart,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  Waves,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useAccount } from "@/components/account-context";
import { BasisSwitch } from "@/components/ui/basis-switch";
import {
  accountFromParse,
  parseStatement,
  type ImportIssue,
  type IssueResolution,
  type ParseResult,
} from "@/lib/parse-statement";
import { cn, money, pct } from "@/lib/utils";
import {
  MONTHS,
  TODAY,
  dailyEquityFor,
  monthlyReturns,
  type Account,
  type JournalBasis,
} from "@/lib/data";

const METHODS = [
  { id: "html", label: "Statement or journal", hint: "HTML · CSV upload", icon: FileText, ready: true },
  { id: "mt5", label: "MetaTrader 5", hint: "Direct sync", icon: CandlestickChart, ready: false },
  { id: "mt4", label: "MetaTrader 4", hint: "Direct sync", icon: LineChart, ready: false },
  { id: "ctrader", label: "cTrader", hint: "Direct sync", icon: Waves, ready: false },
];

type Step = "methods" | "html";

/**
 * Return since inception. Imported accounts carry an explicit starting
 * balance; demo accounts do not, so their own equity series supplies the base.
 */
function netReturn(a: Account): number | null {
  const base = a.startingBalance || dailyEquityFor(a)[0]?.equity;
  if (!base) return null;
  return ((a.equity - base) / base) * 100;
}

/** Sorted trade dates, oldest first — nothing for demo accounts. */
function tradeDates(a: Account): Date[] {
  return (a.trades ?? [])
    .map((t) => t.date)
    .sort((x, y) => x.getTime() - y.getTime());
}

/**
 * When the account started: the first trade in the statement. Demo accounts
 * only carry a `since` year, so they fall back to the start of that year.
 */
function startDate(a: Account): Date | null {
  const d = tradeDates(a);
  if (d.length) return d[0];
  return a.since ? new Date(a.since, 0, 1) : null;
}

type StatusTone = "active" | "paused" | "inactive";

/**
 * Derived from how recently the account traded — there is no stored status
 * field, and recency is the honest proxy: an account nobody has traded in
 * three months is not "active" whatever its equity says.
 */
function accountStatus(a: Account): { label: string; tone: StatusTone } {
  const d = tradeDates(a);
  if (!d.length) return { label: "Active", tone: "active" };
  const days =
    (TODAY.getTime() - d[d.length - 1].getTime()) / 86_400_000;
  if (days <= 30) return { label: "Active", tone: "active" };
  if (days <= 90) return { label: "Paused", tone: "paused" };
  return { label: "Inactive", tone: "inactive" };
}

function accountKind(a: Account): string {
  if (a.source === "html") return "Backtest";
  return a.accountType ?? a.broker.split("·")[1]?.trim() ?? "Broker";
}

const dayMonthYear = (d: Date) =>
  d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

/**
 * Ten segments, one per 10% of return. Gains fill green from the left,
 * losses fill red the same way — a losing account should read as loudly as
 * a winning one, so it is never just an empty meter.
 */
function ReturnMeter({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-label text-ink-muted">—</span>;
  const lit = Math.min(10, Math.round(Math.abs(value) / 10));
  const up = value >= 0;
  return (
    <span className="flex items-center gap-3">
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-5 w-1.5 rounded-full transition-colors duration-500",
              i < lit ? (up ? "bg-profit" : "bg-loss") : "border border-line bg-raised",
            )}
            style={i < lit ? { opacity: 0.85 } : undefined}
          />
        ))}
      </span>
      <span
        className={cn(
          "text-label tnum font-medium",
          up ? "text-profit" : "text-loss",
        )}
      >
        {pct(value, { signed: true })}
      </span>
    </span>
  );
}

const STATUS_CHIP: Record<StatusTone, string> = {
  active: "border-profit/40 bg-profit-soft text-profit",
  paused: "border-warn/40 bg-warn-soft text-warn",
  inactive: "border-loss/40 bg-loss-soft text-loss",
};

/* The reference's status tint: a gradient entering from the row's right
   edge, not a full wash. Colour vars match the status chip. */
const ROW_GRADIENT: Record<StatusTone, string> = {
  active: "var(--color-profit)",
  paused: "var(--color-warn)",
  inactive: "var(--color-loss)",
};

/* Reference entrance: rows spring in staggered, from blur and offset. */
const listVariants = {
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const rowVariants = {
  hidden: { opacity: 0, x: -25, scale: 0.95, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 400, damping: 28, mass: 0.6 },
  },
};

/* One grid template shared by the header row and every account card, so the
   columns stay aligned without a <table>. The status column is a FIXED width
   that already fits the chip plus the three hover actions — an `auto` track
   would widen the moment the actions fade in and shunt every other column
   left, so rows would visibly jump out of alignment on hover. */
const GRID =
  "grid grid-cols-[minmax(160px,1.5fr)_minmax(90px,1fr)_minmax(90px,1fr)_minmax(100px,1fr)_minmax(80px,0.9fr)_minmax(170px,1.3fr)_190px] items-center gap-x-4";

export function Accounts() {
  const { accounts, imported, addAccount, updateAccount, removeAccount } =
    useAccount();
  const router = useRouter();

  /* -------- add / replace statement modal -------- */
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("methods");
  /** When set, the upload replaces this account's data instead of adding. */
  const [replaceTarget, setReplaceTarget] = useState<Account | null>(null);

  const [name, setName] = useState("");
  const [balance, setBalance] = useState("10000");
  const [risk, setRisk] = useState("1");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** Parsed as soon as a file is chosen, so the user checks the numbers
      BEFORE the account exists. Connect just confirms what's shown. */
  const [preview, setPreview] = useState<Extract<ParseResult, { ok: true }> | null>(null);
  const [basis, setBasis] = useState<JournalBasis>("compounded");
  /** Per flagged row: use the suggested date, keep the sheet's, or skip. */
  const [resolutions, setResolutions] = useState<Record<string, IssueResolution>>({});
  /** True while a file is being dragged over the window (upload step open). */
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function openAdd() {
    setReplaceTarget(null);
    setStep("methods");
    setName("");
    setBalance("10000");
    setRisk("1");
    setFileName("");
    setFileText("");
    setError("");
    setPreview(null);
    setBasis("compounded");
    setResolutions({});
    setOpen(true);
  }

  function openReplace(a: Account) {
    setReplaceTarget(a);
    setStep("html");
    setName(a.name);
    setBalance(String(a.startingBalance ?? 10000));
    setRisk(String(a.riskPerTrade ?? 1));
    setFileName("");
    setFileText("");
    setError("");
    setPreview(null);
    setBasis("compounded");
    setResolutions({});
    setOpen(true);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    await handleFile(e.target.files?.[0]);
  }

  /** Shared by the file picker and drag-and-drop. */
  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(html?|csv|tsv|txt)$/i.test(file.name)) {
      setError("That file type isn't supported — drop an .html or .csv export.");
      return;
    }
    setError("");
    setFileName(file.name);
    // Decode by BOM — MT5 saves reports as UTF-16.
    const buf = await file.arrayBuffer();
    const b = new Uint8Array(buf);
    const enc =
      b[0] === 0xff && b[1] === 0xfe
        ? "utf-16le"
        : b[0] === 0xfe && b[1] === 0xff
          ? "utf-16be"
          : "utf-8";
    const text = new TextDecoder(enc).decode(buf);
    setFileText(text);
    if (!name) setName(file.name.replace(/\.html?$/i, ""));

    // Parse immediately — the preview below the form is the check that the
    // sheet was read right, before anything is saved.
    const res = parseStatement(text, file.name);
    if (res.ok) {
      setPreview(res);
      setResolutions({});
    } else {
      setPreview(null);
      setError(res.error);
    }
  }

  /* Whole-window drag-and-drop while the upload step is open: dropping the
     export anywhere on the screen files it, no aiming at the dropzone
     required. Listeners go on window so the dialog scrim can't swallow the
     drop, and dragover must preventDefault or the browser navigates away. */
  const dragDepth = useRef(0);
  // Latest handleFile — the drop listener registers once per dialog open, but
  // must not capture a stale closure (it would clobber a typed account name).
  const handleFileRef = useRef<(f: File | undefined) => Promise<void>>(null);
  useEffect(() => {
    handleFileRef.current = handleFile;
  });
  useEffect(() => {
    if (!open || step !== "html") return;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragDepth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const leave = () => {
      if (--dragDepth.current <= 0) {
        dragDepth.current = 0;
        setDragging(false);
      }
    };
    const drop = (e: DragEvent) => {
      dragDepth.current = 0;
      setDragging(false);
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      void handleFileRef.current?.(e.dataTransfer.files[0]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      dragDepth.current = 0;
      setDragging(false);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [open, step]);

  function onConnect() {
    setError("");
    if (!fileText) {
      setError("Choose an HTML statement first.");
      return;
    }
    if (!preview) {
      const res = parseStatement(fileText, fileName);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res);
      return;
    }
    setBusy(true);
    const fresh = accountFromParse(
      {
        name,
        startingBalance: Math.max(0, parseFloat(balance) || 0),
        riskPerTrade: Math.max(0, parseFloat(risk) || 0),
      },
      preview,
      basis,
      resolutions,
    );
    if (replaceTarget) {
      // Keep identity and user-set labels; refresh the data.
      updateAccount({
        ...fresh,
        id: replaceTarget.id,
        name: name.trim() || replaceTarget.name,
        accountType: replaceTarget.accountType,
      });
      setBusy(false);
      setOpen(false);
    } else {
      addAccount(fresh);
      setBusy(false);
      setOpen(false);
      router.push("/");
    }
  }

  /* -------- edit dialog -------- */
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editRisk, setEditRisk] = useState("");
  const [editType, setEditType] = useState("");

  function openEdit(a: Account) {
    setEditTarget(a);
    setEditName(a.name);
    setEditRisk(a.riskPerTrade != null ? String(a.riskPerTrade) : "");
    setEditType(a.accountType ?? "");
  }

  function saveEdit() {
    if (!editTarget) return;
    updateAccount({
      ...editTarget,
      name: editName.trim() || editTarget.name,
      riskPerTrade: editRisk ? Math.max(0, parseFloat(editRisk) || 0) : undefined,
      accountType: editType.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
    setEditTarget(null);
  }

  /* -------- account row card -------- */
  function Row({ a, demo }: { a: Account; demo?: boolean }) {
    const ret = netReturn(a);
    const status = accountStatus(a);
    const start = startDate(a);
    return (
      <motion.li
        role="link"
        tabIndex={0}
        variants={rowVariants}
        whileHover={{
          y: -1,
          transition: { type: "spring", stiffness: 400, damping: 25 },
        }}
        onClick={() => router.push(`/accounts/${a.id}`)}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/accounts/${a.id}`)}
        className={cn(
          GRID,
          "group relative isolate cursor-pointer overflow-hidden rounded-lg border border-line bg-raised/50 px-4 py-3",
          "transition-colors duration-150 ease-out hover:border-line-strong",
        )}
      >
        {/* Status gradient entering from the right — the reference's tint. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage: `linear-gradient(to left, color-mix(in srgb, ${ROW_GRADIENT[status.tone]} 10%, transparent), transparent)`,
            backgroundSize: "30% 100%",
            backgroundPosition: "right",
            backgroundRepeat: "no-repeat",
          }}
        />
        <span className="min-w-0">
          <span className="block truncate text-body font-medium text-ink">
            {a.name}
          </span>
          <span className="block truncate text-label text-ink-muted">
            {a.trades?.length ?? "—"} trades
          </span>
        </span>

        <span className="text-body font-medium tnum whitespace-nowrap text-ink">
          {money(a.equity)}
        </span>

        <span className="truncate text-body text-ink-secondary">
          {accountKind(a)}
        </span>

        <span className="text-body tnum whitespace-nowrap text-ink-secondary">
          {start ? dayMonthYear(start) : "—"}
        </span>

        {/* Strategy links in once the strategies tab exists. */}
        <span className="text-body text-ink-muted">—</span>

        <ReturnMeter value={ret} />

        <span className="flex items-center justify-end gap-1">
          {!demo && (
            <span
              className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 focus-within:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <RowAction label={`Edit ${a.name}`} onClick={() => openEdit(a)}>
                <Pencil className="size-4" aria-hidden />
              </RowAction>
              <RowAction
                label={`Replace statement for ${a.name}`}
                onClick={() => openReplace(a)}
              >
                <RefreshCw className="size-4" aria-hidden />
              </RowAction>
              <RowAction
                label={`Remove ${a.name}`}
                danger
                onClick={() => removeAccount(a.id)}
              >
                <Trash2 className="size-4" aria-hidden />
              </RowAction>
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
              STATUS_CHIP[status.tone],
            )}
          >
            {status.label}
          </span>
        </span>
      </motion.li>
    );
  }

  const demos = accounts.filter((a) => a.source !== "html");

  return (
    <>
      <section aria-label="Trading accounts">
        <Card className="overflow-hidden">
          <CardHeader bordered>
            <div>
              <CardTitle>Trading accounts</CardTitle>
              <p className="mt-0.5 text-label text-ink-muted">
                {imported.length
                  ? `${imported.length} connected · click an account for full analytics`
                  : "Connect an account to see its performance"}
              </p>
            </div>
            <Button variant="primary" size="sm" pill onClick={openAdd}>
              <Plus aria-hidden />
              Add account
            </Button>
          </CardHeader>

          {imported.length === 0 && demos.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <span className="flex size-11 items-center justify-center rounded-lg bg-raised">
                <FileText className="size-5 text-ink-muted" aria-hidden />
              </span>
              <p className="mt-4 text-body font-medium text-ink">No accounts yet</p>
              <p className="mt-1 max-w-xs text-label text-ink-muted">
                Add an account to import your trades and track performance across
                the dashboard.
              </p>
              <Button variant="secondary" className="mt-5" onClick={openAdd}>
                <Plus aria-hidden />
                Add account
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto px-4 pb-4">
              <div className="min-w-[880px]">
                {/* Transparent border + identical padding to a row card, so
                    the header's grid tracks resolve to the same widths — a
                    1px border difference makes the fr columns diverge. */}
                <div
                  className={cn(
                    GRID,
                    "border border-transparent px-4 py-2.5 text-eyebrow font-medium text-ink-muted",
                  )}
                  aria-hidden
                >
                  <span>Account</span>
                  <span>Balance</span>
                  <span>Type</span>
                  <span>Start date</span>
                  <span>Strategy</span>
                  <span>Return</span>
                  <span className="text-right">Status</span>
                </div>
                <motion.ul
                  aria-label="Trading accounts with balance, type, start date, strategy, return and status"
                  className="space-y-2"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {imported.map((a) => (
                    <Row key={a.id} a={a} />
                  ))}
                  {demos.map((a) => (
                    <Row key={a.id} a={a} demo />
                  ))}
                </motion.ul>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Add / replace modal */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        // The import preview shows a year × 12-month grid — give it room.
        className={step === "html" ? "max-w-2xl" : undefined}
        title={
          replaceTarget
            ? `Replace statement — ${replaceTarget.name}`
            : step === "methods"
              ? "Add account"
              : "Import trades"
        }
        description={
          replaceTarget
            ? "Upload a newer export; trades and balances are re-read from it"
            : step === "methods"
              ? "Choose how to connect"
              : "Name it, set your balance and risk, then upload an HTML or CSV export"
        }
        leading={
          step === "html" && !replaceTarget ? (
            <button
              type="button"
              onClick={() => setStep("methods")}
              aria-label="Back to methods"
              className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-overlay hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </button>
          ) : undefined
        }
      >
        {step === "methods" ? (
          <div className="grid grid-cols-2 gap-3">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!m.ready}
                  onClick={() => m.ready && setStep("html")}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-3.5 text-left transition-colors duration-150 ease-out",
                    m.ready
                      ? "border-line bg-raised hover:border-accent hover:bg-accent-soft"
                      : "cursor-not-allowed border-line bg-raised opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md",
                      m.ready ? "bg-accent-soft text-accent" : "bg-overlay text-ink-muted",
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-body font-medium text-ink">
                        {m.label}
                      </span>
                      {!m.ready && <Badge tone="neutral">Soon</Badge>}
                    </span>
                    <span className="block text-label text-ink-muted">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-5">
            <label className="block">
              <span className="text-label text-ink-secondary">Account name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Test Account 1"
                className="mt-1.5"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-label text-ink-secondary">
                  Account balance ($)
                </span>
                <Input
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  inputMode="decimal"
                  placeholder="10000"
                  className="mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-label text-ink-secondary">
                  Risk per trade (%)
                </span>
                <Input
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                  inputMode="decimal"
                  placeholder="1"
                  className="mt-1.5"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border border-dashed px-4 py-4 text-left",
                "transition-colors duration-150 ease-out",
                dragging
                  ? "border-accent bg-accent-soft"
                  : "border-line-strong bg-raised hover:border-accent",
              )}
            >
              {dragging ? (
                <UploadCloud className="size-5 shrink-0 animate-pulse text-accent" aria-hidden />
              ) : fileName ? (
                <FileText className="size-5 shrink-0 text-accent" aria-hidden />
              ) : (
                <UploadCloud className="size-5 shrink-0 text-ink-muted" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-ink">
                  {dragging
                    ? "Drop it anywhere"
                    : fileName || "Choose or drop a file"}
                </span>
                <span className="block text-label text-ink-muted">
                  {dragging
                    ? "Release to load the file"
                    : fileName
                      ? "Click to replace, or drop a new file"
                      : "MT4 / MT5 statement, or a journal export from Sheets / Excel"}
                </span>
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,.csv,.tsv,text/html,text/csv"
              onChange={onFile}
              className="sr-only"
            />

            {error && (
              <p className="flex items-start gap-2 text-label text-loss">
                <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            {preview && (
              <ImportPreview
                res={preview}
                balance={Math.max(0, parseFloat(balance) || 0)}
                basis={basis}
                onBasis={setBasis}
                resolutions={resolutions}
                onResolve={(id, r) =>
                  setResolutions((prev) => ({ ...prev, [id]: r }))
                }
              />
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onConnect}
                disabled={busy || !preview}
              >
                {replaceTarget ? "Replace data" : "Connect account"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit account"
        description="Name, risk per trade and your own account-type label"
      >
        <div className="space-y-5">
          <label className="block">
            <span className="text-label text-ink-secondary">Account name</span>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1.5"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-label text-ink-secondary">
                Risk per trade (%)
              </span>
              <Input
                value={editRisk}
                onChange={(e) => setEditRisk(e.target.value)}
                inputMode="decimal"
                placeholder="1"
                className="mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-label text-ink-secondary">Account type</span>
              <Input
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                placeholder="Prop · Evaluation"
                className="mt-1.5"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEdit}>
              Save changes
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

// Month-year only — day-level precision doesn't fit the stat cell and adds
// nothing to a range check.
const previewDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

/**
 * What the app understood from the uploaded file, shown BEFORE the account is
 * created: headline stats and the monthly returns by year, exactly as the
 * dashboard will compute them. If these numbers don't match the user's own
 * sheet, this is the moment to find out — not three screens later.
 */
function ImportPreview({
  res,
  balance,
  basis,
  onBasis,
  resolutions,
  onResolve,
}: {
  res: Extract<ParseResult, { ok: true }>;
  balance: number;
  basis: JournalBasis;
  onBasis: (b: JournalBasis) => void;
  resolutions: Record<string, IssueResolution>;
  onResolve: (id: string, r: IssueResolution) => void;
}) {
  // A throwaway account built the same way Connect will build it, so the
  // preview and the dashboard can never disagree.
  const temp = useMemo(
    () =>
      accountFromParse(
        { name: "preview", startingBalance: balance, riskPerTrade: 1 },
        res,
        basis,
        resolutions,
      ),
    [res, balance, basis, resolutions],
  );

  const start = temp.startingBalance ?? 0;
  const ret = start ? ((temp.equity - start) / start) * 100 : 0;
  const years = useMemo(() => monthlyReturns(temp), [temp]);

  const first = temp.trades?.[0]?.date ?? res.firstDate;
  const last = temp.trades?.[temp.trades.length - 1]?.date ?? res.lastDate;
  const stats: { label: string; value: string; tone?: "profit" | "loss" }[] = [
    { label: "Trades", value: String(temp.trades?.length ?? 0) },
    {
      label: "Period",
      value: `${previewDate(first)} – ${previewDate(last)}`,
    },
    {
      label: "Net return",
      value: pct(ret, { signed: true }),
      tone: ret >= 0 ? "profit" : "loss",
    },
    { label: "Final equity", value: money(temp.equity) },
  ];

  return (
    <section
      aria-label="Import preview"
      className="overflow-hidden rounded-md border border-line bg-raised/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-body font-medium text-ink">Check the numbers</p>
          <p className="text-label text-ink-muted">
            {res.journal
              ? "Read as a journal sheet — percent returns per trade"
              : "Read as a MetaTrader statement — dollar P&L per trade"}
          </p>
        </div>
        {res.journal && <BasisSwitch value={basis} onChange={onBasis} />}
      </div>

      {/* Period is the widest stat — give it the extra track share. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3.5 sm:grid-cols-[0.7fr_1.6fr_1fr_1fr]">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-[10.5px] leading-3 text-ink-muted">{s.label}</dt>
            <dd
              className={cn(
                "mt-1 truncate text-[13px] leading-4 font-semibold tnum",
                s.tone === "profit"
                  ? "text-profit"
                  : s.tone === "loss"
                    ? "text-loss"
                    : "text-ink",
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {res.issues && res.issues.length > 0 && (
        <div className="border-t border-grid px-4 py-3.5">
          <p className="flex items-center gap-2 text-body font-medium text-ink">
            <AlertCircle className="size-4 text-warn" aria-hidden />
            {res.issues.length === 1
              ? "One row looks off — check it"
              : `${res.issues.length} rows look off — check them`}
          </p>
          <ul className="mt-3 space-y-3">
            {res.issues.map((iss) => (
              <IssueRow
                key={iss.id}
                issue={iss}
                value={resolutions[iss.id] ?? "fix"}
                onChange={(r) => onResolve(iss.id, r)}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto border-t border-grid px-1 pb-1">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Monthly percentage returns by year, as they will appear on the
            dashboard
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="py-1.5 pr-2 pl-3 text-left text-[10px] font-normal text-ink-muted"
              >
                <span className="sr-only">Year</span>
              </th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="px-1.5 py-1.5 text-right text-[10px] font-normal text-ink-muted"
                >
                  {m}
                </th>
              ))}
              <th
                scope="col"
                className="border-l border-grid py-1.5 pr-3 pl-2 text-right text-[10px] font-normal text-ink-muted"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((row) => (
              <tr key={row.year}>
                <th
                  scope="row"
                  className="border-t border-grid py-1.5 pr-2 pl-3 text-left text-[11px] font-semibold tnum text-ink"
                >
                  {row.year}
                </th>
                {row.months.map((cell, i) => (
                  <td
                    key={i}
                    className="border-t border-grid px-1.5 py-1.5 text-right"
                  >
                    {cell === null ? (
                      <span className="text-[11px] text-ink-muted/45" aria-hidden>
                        –
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "text-[11px] font-medium tnum",
                          cell.ret >= 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {cell.ret >= 0 ? "+" : "−"}
                        {Math.abs(cell.ret).toFixed(1)}
                      </span>
                    )}
                  </td>
                ))}
                <td className="border-t border-l border-grid py-1.5 pr-3 pl-2 text-right">
                  <span
                    className={cn(
                      "text-[11px] font-semibold tnum",
                      row.total >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {row.total >= 0 ? "+" : "−"}
                    {Math.abs(row.total).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(res.journal || res.skipped) && (
        <p className="border-t border-grid px-4 py-2.5 text-[11px] leading-4 text-ink-muted">
          {res.skipped && (
            <>
              {[
                res.skipped.open &&
                  `${res.skipped.open} ${res.skipped.open === 1 ? "row" : "rows"} skipped (no result yet — still open)`,
                res.skipped.unreadable &&
                  `${res.skipped.unreadable} ${res.skipped.unreadable === 1 ? "row" : "rows"} skipped (unreadable return)`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {res.journal && " — "}
            </>
          )}
          {res.journal && (
            <>
              {basis === "compounded"
                ? "Compounded: each trade’s % applies to the equity at that moment, so monthly figures match your sheet exactly."
                : "Fixed: each trade’s % is worth the same dollars throughout (percent of the starting balance)."}{" "}
              You can switch this later from the dashboard.
            </>
          )}
        </p>
      )}
    </section>
  );
}

/**
 * One flagged row and the three ways to handle it. The suggestion is
 * preselected — it's what the surrounding rows imply — but nothing is
 * silently changed: the row is visible right here, before connecting.
 */
function IssueRow({
  issue,
  value,
  onChange,
}: {
  issue: ImportIssue;
  value: IssueResolution;
  onChange: (r: IssueResolution) => void;
}) {
  const options: { id: IssueResolution; label: string }[] = [
    { id: "fix", label: `Use ${issue.suggestedDate}` },
    { id: "keep", label: `Keep ${issue.rawDate}` },
    { id: "skip", label: "Skip trade" },
  ];
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="min-w-0 text-label text-ink-secondary">
        <span className="font-medium tnum text-ink">{issue.rawDate}</span>{" "}
        {issue.pair}{" "}
        <span
          className={cn(
            "tnum font-medium",
            issue.pct >= 0 ? "text-profit" : "text-loss",
          )}
        >
          {issue.pct >= 0 ? "+" : "−"}
          {Math.abs(issue.pct).toFixed(1)}%
        </span>{" "}
        sits between {issue.prevDate} and {issue.nextDate} — likely{" "}
        {issue.suggestedDate}
      </p>
      <div
        role="radiogroup"
        aria-label={`Row dated ${issue.rawDate}`}
        className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-raised p-0.5"
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 ease-out",
              value === o.id
                ? "bg-overlay text-ink"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </li>
  );
}

function RowAction({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-overlay",
        danger ? "hover:text-loss" : "hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
