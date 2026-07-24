"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CandlestickChart,
  FileText,
  LineChart,
  Plus,
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
import { cn, money } from "@/lib/utils";

const METHODS = [
  { id: "html", label: "HTML statement", hint: "MT4 / MT5 export", icon: FileText, ready: true },
  { id: "mt5", label: "MetaTrader 5", hint: "Direct sync", icon: CandlestickChart, ready: false },
  { id: "mt4", label: "MetaTrader 4", hint: "Direct sync", icon: LineChart, ready: false },
  { id: "ctrader", label: "cTrader", hint: "Direct sync", icon: Waves, ready: false },
];

type Step = "methods" | "html";

export function Accounts() {
  const { imported, addAccount, removeAccount } = useAccount();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("methods");

  const [name, setName] = useState("");
  const [balance, setBalance] = useState("10000");
  const [risk, setRisk] = useState("1");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function openModal() {
    setStep("methods");
    setName("");
    setBalance("10000");
    setRisk("1");
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
    // Decode by BOM — MT5 saves reports as UTF-16, which file.text() (UTF-8)
    // would turn into garbage, hiding every table from the parser.
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
    addAccount(
      accountFromParse(
        {
          name,
          startingBalance: Math.max(0, parseFloat(balance) || 0),
          riskPerTrade: Math.max(0, parseFloat(risk) || 0),
        },
        res,
      ),
    );
    setBusy(false);
    setOpen(false);
    router.push("/");
  }

  return (
    <>
      {/* Page: connected accounts + the entry point */}
      <section aria-label="Trading accounts">
        <Card>
          <CardHeader bordered>
            <div>
              <CardTitle>Trading accounts</CardTitle>
              <p className="mt-0.5 text-label text-ink-muted">
                {imported.length
                  ? `${imported.length} connected`
                  : "Connect an account to see its performance"}
              </p>
            </div>
            <Button variant="primary" onClick={openModal}>
              <Plus aria-hidden />
              Add account
            </Button>
          </CardHeader>

          {imported.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <span className="flex size-11 items-center justify-center rounded-lg bg-raised">
                <FileText className="size-5 text-ink-muted" aria-hidden />
              </span>
              <p className="mt-4 text-body font-medium text-ink">
                No accounts yet
              </p>
              <p className="mt-1 max-w-xs text-label text-ink-muted">
                Add an account to import your trades and track performance across
                the dashboard.
              </p>
              <Button variant="secondary" className="mt-5" onClick={openModal}>
                <Plus aria-hidden />
                Add account
              </Button>
            </div>
          ) : (
            <ul>
              {imported.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft">
                    <FileText className="size-4 text-accent" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-title text-ink">{a.name}</p>
                    <p className="mt-0.5 text-label text-ink-muted">
                      {a.trades?.length ?? 0} trades · since {a.since} ·{" "}
                      {money(a.equity)}
                      {a.riskPerTrade != null && ` · ${a.riskPerTrade}% risk`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAccount(a.id)}
                    aria-label={`Remove ${a.name}`}
                    className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-overlay hover:text-loss"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Add-account modal */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={step === "methods" ? "Add account" : "HTML statement"}
        description={
          step === "methods"
            ? "Choose how to connect"
            : "Name it, set your balance and risk, then upload"
        }
        leading={
          step === "html" ? (
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
                    <span className="block text-label text-ink-muted">
                      {m.hint}
                    </span>
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
                Connect account
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
