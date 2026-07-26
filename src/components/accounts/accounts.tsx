"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CandlestickChart,
  ChevronRight,
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
import { accountFromParse, parseStatement } from "@/lib/parse-statement";
import { cn, money, pct } from "@/lib/utils";
import type { Account } from "@/lib/data";

const METHODS = [
  { id: "html", label: "HTML statement", hint: "MT4 / MT5 export", icon: FileText, ready: true },
  { id: "mt5", label: "MetaTrader 5", hint: "Direct sync", icon: CandlestickChart, ready: false },
  { id: "mt4", label: "MetaTrader 4", hint: "Direct sync", icon: LineChart, ready: false },
  { id: "ctrader", label: "cTrader", hint: "Direct sync", icon: Waves, ready: false },
];

type Step = "methods" | "html";

function netReturn(a: Account): number | null {
  if (!a.startingBalance) return null;
  return ((a.equity - a.startingBalance) / a.startingBalance) * 100;
}

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
    setOpen(true);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
    setFileText(new TextDecoder(enc).decode(buf));
    if (!name) setName(file.name.replace(/\.html?$/i, ""));
  }

  function onConnect() {
    setError("");
    if (!fileText) {
      setError("Choose an HTML statement first.");
      return;
    }
    setBusy(true);
    const res = parseStatement(fileText);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    const fresh = accountFromParse(
      {
        name,
        startingBalance: Math.max(0, parseFloat(balance) || 0),
        riskPerTrade: Math.max(0, parseFloat(risk) || 0),
      },
      res,
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

  /* -------- row -------- */
  function Row({ a, demo }: { a: Account; demo?: boolean }) {
    const ret = netReturn(a);
    return (
      <li
        role="link"
        tabIndex={0}
        onClick={() => router.push(`/accounts/${a.id}`)}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/accounts/${a.id}`)}
        className="group flex cursor-pointer items-center gap-4 border-b border-line px-5 py-4 transition-colors duration-150 ease-out last:border-0 hover:bg-raised"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md",
            demo ? "bg-raised" : "bg-accent-soft",
          )}
        >
          <FileText
            className={cn("size-4", demo ? "text-ink-muted" : "text-accent")}
            aria-hidden
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-title text-ink">{a.name}</p>
            <Badge tone={demo ? "neutral" : "accent"}>
              {demo ? "Demo" : "Imported"}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-label text-ink-muted">
            {a.broker}
            {a.accountType ? ` · ${a.accountType}` : ""} ·{" "}
            {a.trades?.length ?? "—"} trades
            {a.riskPerTrade != null ? ` · ${a.riskPerTrade}% risk` : ""}
            {a.updatedAt
              ? ` · updated ${new Date(a.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : ""}
          </p>
        </div>

        <div className="hidden text-right sm:block">
          <p className="text-body font-semibold tnum text-ink">
            {money(a.equity)}
          </p>
          {ret !== null && (
            <p
              className={cn(
                "mt-0.5 text-label tnum",
                ret >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {pct(ret, { signed: true })}
            </p>
          )}
        </div>

        {!demo && (
          <div
            className="flex shrink-0 items-center gap-1"
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
          </div>
        )}

        <ChevronRight
          className="size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          aria-hidden
        />
      </li>
    );
  }

  const demos = accounts.filter((a) => a.source !== "html");

  return (
    <>
      <section aria-label="Trading accounts">
        <Card>
          <CardHeader bordered>
            <div>
              <CardTitle>Trading accounts</CardTitle>
              <p className="mt-0.5 text-label text-ink-muted">
                {imported.length
                  ? `${imported.length} connected · click an account for full analytics`
                  : "Connect an account to see its performance"}
              </p>
            </div>
            <Button variant="primary" onClick={openAdd}>
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
            <ul>
              {imported.map((a) => (
                <Row key={a.id} a={a} />
              ))}
              {demos.map((a) => (
                <Row key={a.id} a={a} demo />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Add / replace modal */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={
          replaceTarget
            ? `Replace statement — ${replaceTarget.name}`
            : step === "methods"
              ? "Add account"
              : "HTML statement"
        }
        description={
          replaceTarget
            ? "Upload a newer export; trades and balances are re-read from it"
            : step === "methods"
              ? "Choose how to connect"
              : "Name it, set your balance and risk, then upload"
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
                "flex w-full items-center gap-3 rounded-md border border-dashed border-line-strong bg-raised px-4 py-4 text-left",
                "transition-colors duration-150 ease-out hover:border-accent",
              )}
            >
              {fileName ? (
                <FileText className="size-5 shrink-0 text-accent" aria-hidden />
              ) : (
                <UploadCloud className="size-5 shrink-0 text-ink-muted" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-ink">
                  {fileName || "Choose an HTML statement"}
                </span>
                <span className="block text-label text-ink-muted">
                  {fileName ? "Click to replace" : ".html or .htm from MT4 / MT5"}
                </span>
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              onChange={onFile}
              className="sr-only"
            />

            {error && (
              <p className="flex items-start gap-2 text-label text-loss">
                <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={onConnect} disabled={busy}>
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
