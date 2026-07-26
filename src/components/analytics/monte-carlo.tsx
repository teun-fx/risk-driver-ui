"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, SegmentedControl } from "@/components/ui/input";
import {
  MODEL_BLURBS,
  MODEL_LABELS,
  probAtLeast,
  quantileSorted,
  runMonteCarlo,
  sortedCopy,
  touchProb,
  type McModel,
  type McResult,
} from "@/lib/monte-carlo";
import {
  continuationAnalysis,
  historicalPosition,
  recoveryCurve,
  specFromOption,
  tradeReturns,
  WINDOW_OPTIONS,
  type WindowOption,
} from "@/lib/historical-analysis";
import {
  ContinuationCard,
  DecisionPanel,
  HistoricalExplorer,
  HistoricalPositionCard,
  RecoveryCurveCard,
} from "@/components/analytics/historical-cards";
import { tradeHistoryFor, type Account } from "@/lib/data";
import { cn, money } from "@/lib/utils";

const SIMS = 10_000;
const RISKS = ["Original", "0.25%", "0.5%", "0.75%", "1%", "1.5%", "2%", "Custom"] as const;
const MODELS: McModel[] = ["baseline", "recent", "conservative"];
const BANDS = ["50%", "80%", "95%", "None"] as const;
type Band = (typeof BANDS)[number];
type Mode = "Equity" | "Return %";

const storageKey = (id: string) => `riskdriver.mc.v2.${id}`;

type Settings = {
  seed: number;
  model: McModel;
  risk: (typeof RISKS)[number];
  customRisk: string;
  band: Band;
  window: WindowOption;
  overlay: boolean;
};

const freshSettings = (): Settings => ({
  seed: (Math.random() * 0xffffffff) >>> 0,
  model: "baseline",
  risk: "Original",
  customRisk: "1",
  band: "80%",
  window: "Adaptive",
  overlay: false,
});

/** Per-trade returns, starting balance and pace, from the real history. */
function strategyData(account: Account) {
  const trades = [...tradeHistoryFor(account)].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const net = trades.reduce((a, t) => a + t.pnl, 0);
  const start = account.startingBalance ?? Math.max(1000, account.equity - net);
  const rets = tradeReturns(account, trades);
  const spanDays =
    trades.length > 1
      ? (trades[trades.length - 1].date.getTime() - trades[0].date.getTime()) /
        86_400_000
      : 0;
  const daysPerTrade = trades.length > 1 && spanDays > 0 ? spanDays / trades.length : 0;

  // The account's realised equity curve, for the optional overlay.
  const realised = new Float32Array(trades.length + 1);
  let eq = start;
  realised[0] = eq;
  trades.forEach((t, i) => {
    eq += t.pnl;
    realised[i + 1] = eq;
  });

  return {
    trades,
    returns: Float32Array.from(rets),
    start,
    daysPerTrade,
    realised,
  };
}

/* ================= canvas cloud chart ================= */

const H = 380;
const PAD = { l: 60, r: 14, t: 12, b: 26 };

function cssVar(n: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

function CloudChart({
  result,
  start,
  mode,
  band,
  realised,
  showOverlay,
}: {
  result: McResult;
  start: number;
  mode: Mode;
  band: Band;
  realised: Float32Array;
  showOverlay: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cloudRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Canvas needs an explicit pixel size, so it must track its container.
  // Without this the chart is sized once and stays that way — a window
  // resize (or a zero-width first paint) leaves it permanently blank.
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(wrap);
    setWidth(wrap.clientWidth);
    return () => ro.disconnect();
  }, []);

  const domain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < result.p2_5.length; i++) {
      lo = Math.min(lo, result.p2_5[i]);
      hi = Math.max(hi, result.p97_5[i]);
    }
    for (let i = 0; i < result.bestPath.length; i += 4) {
      hi = Math.max(hi, result.bestPath[i]);
      lo = Math.min(lo, result.worstPath[i]);
    }
    if (showOverlay)
      for (let i = 0; i < realised.length; i += 4) {
        hi = Math.max(hi, realised[i]);
        lo = Math.min(lo, realised[i]);
      }
    lo = Math.min(lo, start);
    hi = Math.max(hi, start);
    const pad = (hi - lo) * 0.04 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [result, start, realised, showOverlay]);

  const toVal = useMemo(
    () =>
      mode === "Equity"
        ? (v: number) => v
        : (v: number) => ((v - start) / start) * 100,
    [mode, start],
  );

  // Static layer: grid, bands, cloud.
  useEffect(() => {
    const canvas = cloudRef.current;
    if (!canvas || width === 0) return;
    const W = width;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { lo, hi } = domain;
    const vLo = toVal(lo);
    const vHi = toVal(hi);
    const x = (t: number) => PAD.l + ((W - PAD.l - PAD.r) * t) / result.nTrades;
    const y = (v: number) =>
      PAD.t + (H - PAD.t - PAD.b) * (1 - (toVal(v) - vLo) / (vHi - vLo));

    ctx.clearRect(0, 0, W, H);
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = cssVar("--color-ink-muted");
    ctx.strokeStyle = cssVar("--color-chart-grid");
    ctx.lineWidth = 1;
    for (let g = 0; g <= 5; g++) {
      const gy = PAD.t + ((H - PAD.t - PAD.b) * g) / 5;
      ctx.beginPath();
      ctx.moveTo(PAD.l, gy);
      ctx.lineTo(W - PAD.r, gy);
      ctx.stroke();
      const val = vHi - ((vHi - vLo) * g) / 5;
      ctx.fillText(
        mode === "Equity" ? `${Math.round(val / 1000)}k` : `${Math.round(val)}%`,
        8,
        gy + 4,
      );
      const trade = Math.round((result.nTrades * g) / 5);
      ctx.fillText(String(trade), x(trade) - 8, H - 8);
    }

    // Starting line.
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = cssVar("--color-ink-muted");
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(start));
    ctx.lineTo(W - PAD.r, y(start));
    ctx.stroke();
    ctx.restore();

    const S = result.cloudX.length;

    // Cloud, then bands drawn over it.
    ctx.strokeStyle = cssVar("--color-chart-2");
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.03;
    let s = 0;
    let raf = 0;
    const drawBatch = () => {
      const end = Math.min(result.sims, s + 400);
      for (; s < end; s++) {
        ctx.beginPath();
        ctx.moveTo(x(0), y(start));
        for (let k = 0; k < S; k++)
          ctx.lineTo(x(result.cloudX[k]), y(result.cloud[s * S + k]));
        ctx.stroke();
      }
      if (s < result.sims) {
        raf = requestAnimationFrame(drawBatch);
        return;
      }
      ctx.globalAlpha = 1;

      // Confidence band on top of the settled cloud.
      if (band !== "None") {
        const [loArr, hiArr] =
          band === "50%"
            ? [result.p25, result.p75]
            : band === "80%"
              ? [result.p10, result.p90]
              : [result.p2_5, result.p97_5];
        ctx.beginPath();
        ctx.moveTo(x(0), y(start));
        for (let k = 0; k < S; k++) ctx.lineTo(x(result.cloudX[k]), y(hiArr[k]));
        for (let k = S - 1; k >= 0; k--) ctx.lineTo(x(result.cloudX[k]), y(loArr[k]));
        ctx.closePath();
        ctx.fillStyle = cssVar("--color-chart-2");
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1;
        ctx.strokeStyle = cssVar("--color-chart-2");
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(drawBatch);
    return () => cancelAnimationFrame(raf);
  }, [result, mode, domain, toVal, start, band, width]);

  // FX layer: highlighted paths, realised overlay, crosshair.
  useEffect(() => {
    const canvas = fxRef.current;
    if (!canvas || width === 0) return;
    const W = width;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { lo, hi } = domain;
    const vLo = toVal(lo);
    const vHi = toVal(hi);
    const x = (t: number) => PAD.l + ((W - PAD.l - PAD.r) * t) / result.nTrades;
    const y = (v: number) =>
      PAD.t + (H - PAD.t - PAD.b) * (1 - (toVal(v) - vLo) / (vHi - vLo));

    ctx.clearRect(0, 0, W, H);

    const stroke = (path: Float32Array, colorVar: string, width: number, dash?: number[]) => {
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = cssVar(colorVar);
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const px = x(i);
        const py = y(path[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    };

    stroke(result.worstPath, "--color-loss", 1.5);
    stroke(result.bestPath, "--color-profit", 1.5);
    stroke(result.avgPath, "--color-accent", 2.25);
    if (showOverlay) stroke(realised, "--color-warn", 2, [6, 3]);

    if (hover !== null) {
      ctx.strokeStyle = cssVar("--color-line-strong");
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x(hover), PAD.t);
      ctx.lineTo(x(hover), H - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [p, c] of [
        [result.bestPath, "--color-profit"],
        [result.avgPath, "--color-accent"],
        [result.worstPath, "--color-loss"],
      ] as const) {
        ctx.fillStyle = cssVar(c);
        ctx.beginPath();
        ctx.arc(x(hover), y(p[hover]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [result, mode, domain, toVal, hover, start, realised, showOverlay, width]);

  const onMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const rel = (e.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r);
    const i = Math.round(rel * result.nTrades);
    setHover(i >= 0 && i <= result.nTrades ? i : null);
  };

  // Hover readout: percentile, probability, expected return and drawdown.
  const h = hover ?? result.nTrades;
  const col = Math.min(
    result.cloudX.length - 1,
    Math.max(0, result.cloudX.findIndex((c) => c >= h)),
  );
  const fmt = (v: number) =>
    mode === "Equity"
      ? money(Math.round(v))
      : `${(((v - start) / start) * 100).toFixed(1)}%`;
  const median = result.p50[col];
  const pctlOfAvg = (() => {
    // Where the average path sits within that column's distribution.
    const S = result.cloudX.length;
    let below = 0;
    for (let s = 0; s < result.sims; s++)
      if (result.cloud[s * S + col] < result.avgPath[h]) below++;
    return Math.round((below / result.sims) * 100);
  })();
  const probUp = (() => {
    const S = result.cloudX.length;
    let c = 0;
    for (let s = 0; s < result.sims; s++) if (result.cloud[s * S + col] > start) c++;
    return Math.round((c / result.sims) * 100);
  })();

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative w-full cursor-crosshair"
        style={{ height: H }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <canvas ref={cloudRef} className="absolute inset-0" />
        <canvas ref={fxRef} className="absolute inset-0" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line px-1 pt-3 sm:grid-cols-3 lg:grid-cols-6">
        <Read label={`Trade ${h.toLocaleString("en-US")}`} value="" plain />
        <Read label="Median" value={fmt(median)} colorVar="--color-chart-2" />
        <Read label="Average" value={fmt(result.avgPath[h])} colorVar="--color-accent" />
        <Read label="Percentile" value={`${pctlOfAvg}th`} plain />
        <Read label="P(above start)" value={`${probUp}%`} plain />
        <Read
          label="Expected drawdown"
          value={`−${(result.ddBand[col] * 100).toFixed(1)}%`}
          colorVar="--color-loss"
        />
      </div>
    </div>
  );
}

function Read({
  label,
  value,
  colorVar,
  plain,
}: {
  label: string;
  value: string;
  colorVar?: string;
  plain?: boolean;
}) {
  return (
    <span className="min-w-0">
      <span className="flex items-center gap-1.5">
        {!plain && colorVar && (
          <span
            className="h-0.5 w-3 shrink-0 rounded-full"
            style={{ background: `var(${colorVar})` }}
            aria-hidden
          />
        )}
        <span className="truncate text-[11px] text-ink-muted">{label}</span>
      </span>
      {value && (
        <span className="mt-0.5 block text-label tnum font-medium text-ink">
          {value}
        </span>
      )}
    </span>
  );
}

function Tile({
  label,
  value,
  chip,
  tone,
}: {
  label: string;
  value: string;
  chip?: string;
  tone?: "loss" | "warn" | "accent" | "profit";
}) {
  return (
    <div className="rounded-md border border-line bg-raised px-4 py-3">
      <p className="text-eyebrow text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-[17px] leading-6 font-semibold tnum",
          tone === "loss"
            ? "text-loss"
            : tone === "warn"
              ? "text-warn"
              : tone === "accent"
                ? "text-accent"
                : tone === "profit"
                  ? "text-profit"
                  : "text-ink",
        )}
      >
        {value}
      </p>
      {chip && (
        <span className="mt-1.5 inline-block rounded-sm border border-line px-1.5 py-0.5 text-[10.5px] text-ink-muted">
          {chip}
        </span>
      )}
    </div>
  );
}

/* ================= the tab ================= */

export function MonteCarloTab({ account }: { account: Account }) {
  const { trades, returns, start, daysPerTrade, realised } = useMemo(
    () => strategyData(account),
    [account],
  );
  const originalRisk = account.riskPerTrade;

  const [settings, setSettings] = useState<Settings>(freshSettings);
  const [result, setResult] = useState<McResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("Equity");
  const runRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(account.id));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only hydration
      setSettings(raw ? { ...freshSettings(), ...JSON.parse(raw) } : freshSettings());
    } catch {
      /* defaults stand */
    }
  }, [account.id]);

  const riskScale = useMemo(() => {
    if (settings.risk === "Original" || !originalRisk) return 1;
    const chosen =
      settings.risk === "Custom"
        ? parseFloat(settings.customRisk) || originalRisk
        : parseFloat(settings.risk);
    return chosen / originalRisk;
  }, [settings.risk, settings.customRisk, originalRisk]);

  // Simulation runs only when its inputs change — never on unrelated renders.
  useEffect(() => {
    if (returns.length < 20) return;
    runRef.current?.cancel();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flags the async worker run
    setRunning(true);
    setProgress(0);
    const run = runMonteCarlo(
      {
        returns,
        startBalance: start,
        seed: settings.seed,
        scale: riskScale,
        model: settings.model,
        daysPerTrade,
        sims: SIMS,
      },
      (d, t) => setProgress(d / t),
    );
    runRef.current = run;
    run.promise
      .then((res) => {
        setResult(res);
        setRunning(false);
      })
      .catch(() => setRunning(false));
    return () => run.cancel();
     
  }, [returns, start, settings.seed, settings.model, riskScale, daysPerTrade]);

  // Persist settings (seed included) so a run is reproducible later.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(account.id), JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [account.id, settings]);

  /* ---- historical analysis (cheap, main thread) ---- */
  const position = useMemo(
    () => historicalPosition(account, trades, specFromOption(settings.window)),
    [account, trades, settings.window],
  );
  const cont = useMemo(
    () => (position ? continuationAnalysis(account, trades, position) : null),
    [account, trades, position],
  );
  const curve = useMemo(
    () => (position && cont ? recoveryCurve(account, trades, position, cont) : null),
    [account, trades, position, cont],
  );

  /* ---- simulation metrics ---- */
  const stats = useMemo(() => {
    if (!result) return null;
    const finals = sortedCopy(result.finals);
    const dd = sortedCopy(result.maxDD);
    const streak = sortedCopy(result.streaks);
    const rec = Array.from(result.recovery).filter((r) => r >= 0).sort((a, b) => a - b);
    let mean = 0;
    for (let i = 0; i < result.finals.length; i++) mean += result.finals[i];
    mean /= result.finals.length;

    const medianFinal = quantileSorted(finals, 0.5);
    const totalDays = daysPerTrade * result.nTrades;
    const cagr =
      totalDays > 0 && start > 0
        ? ((medianFinal / start) ** (365 / totalDays) - 1) * 100
        : null;

    return {
      p5: quantileSorted(finals, 0.05),
      p25: quantileSorted(finals, 0.25),
      median: medianFinal,
      p75: quantileSorted(finals, 0.75),
      p95: quantileSorted(finals, 0.95),
      mean,
      probProfit: probAtLeast(result.finals, start * 1.000001),
      up5: touchProb(result.touch, 0, result.sims),
      up10: touchProb(result.touch, 1, result.sims),
      dn5: touchProb(result.touch, 2, result.sims),
      dn10: touchProb(result.touch, 3, result.sims),
      ddMedian: quantileSorted(dd, 0.5),
      streakMedian: quantileSorted(streak, 0.5),
      recoveryMedian: rec.length ? rec[Math.floor(rec.length / 2)] : null,
      neverRecovered: 1 - rec.length / result.sims,
      expReturnPct: ((medianFinal - start) / start) * 100,
      cagr,
    };
  }, [result, start, daysPerTrade]);

  /** R equivalent of a % figure, only when risk-per-trade is known. */
  const rInfo = (pctVal: number | null) =>
    pctVal !== null && originalRisk
      ? `${(pctVal / originalRisk >= 0 ? "+" : "−")}${Math.abs(pctVal / originalRisk).toFixed(1)}R`
      : null;

  if (returns.length < 20) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-center">
          <p className="max-w-sm text-label text-ink-muted">
            This module needs at least 20 closed trades. Import a fuller
            statement to build rolling windows and simulate this strategy.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <>
      {/* 1 — Historical position */}
      <HistoricalPositionCard
        position={position}
        windowLabel={settings.window}
        windowOptions={WINDOW_OPTIONS}
        onWindowChange={(w) =>
          setSettings((s) => ({ ...s, window: w as WindowOption }))
        }
      />

      {/* 2 — Monte Carlo, with the interpretation rail beside it */}
      <section
        aria-label="Monte Carlo simulation"
        className="grid grid-cols-1 gap-5 xl:grid-cols-4"
      >
        <div className="min-w-0 space-y-5 xl:col-span-3">
          {/* Controls */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4 pt-5">
              <div>
                <p className="text-label text-ink-secondary">Sampling model</p>
                <SegmentedControl
                  options={MODELS.map((m) => MODEL_LABELS[m])}
                  value={MODEL_LABELS[settings.model]}
                  onChange={(label) =>
                    setSettings((s) => ({
                      ...s,
                      model: MODELS.find((m) => MODEL_LABELS[m] === label)!,
                    }))
                  }
                  ariaLabel="Sampling model"
                />
              </div>
              <div>
                <p className="text-label text-ink-secondary">Confidence band</p>
                <SegmentedControl
                  options={BANDS}
                  value={settings.band}
                  onChange={(band) => setSettings((s) => ({ ...s, band }))}
                  ariaLabel="Confidence band"
                />
              </div>
              <div>
                <p className="text-label text-ink-secondary">Risk per trade</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {originalRisk ? (
                    <>
                      <SegmentedControl
                        options={RISKS}
                        value={settings.risk}
                        onChange={(risk) => setSettings((s) => ({ ...s, risk }))}
                        ariaLabel="Risk per trade"
                      />
                      {settings.risk === "Custom" && (
                        <Input
                          value={settings.customRisk}
                          onChange={(e) =>
                            setSettings((s) => ({ ...s, customRisk: e.target.value }))
                          }
                          inputMode="decimal"
                          className="w-20"
                          aria-label="Custom risk percent"
                        />
                      )}
                    </>
                  ) : (
                    <p className="text-label text-ink-muted">
                      Original only — no risk-per-trade set for this account.
                    </p>
                  )}
                </div>
              </div>

              <div className="ml-auto flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-label text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={settings.overlay}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, overlay: e.target.checked }))
                    }
                    className="size-3.5 accent-[var(--color-warn)]"
                  />
                  Overlay realised
                </label>
                <span className="font-mono text-[10.5px] text-ink-muted">
                  seed {settings.seed.toString(16)}
                </span>
                <Button
                  variant="primary"
                  disabled={running}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      seed: (Math.random() * 0xffffffff) >>> 0,
                    }))
                  }
                >
                  <RefreshCw className={cn(running && "animate-spin")} aria-hidden />
                  Run simulation
                </Button>
              </div>

              <p className="w-full border-t border-line pt-3 text-[11.5px] text-ink-muted">
                {MODEL_BLURBS[settings.model]} Blocks of consecutive trades are
                resampled, so losing runs keep a realistic shape.
              </p>
            </CardContent>
          </Card>

          {/* 6 — percentile cards */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Tile label="5th %ile" value={money(Math.round(stats.p5))} tone="loss" />
              <Tile label="25th %ile" value={money(Math.round(stats.p25))} tone="warn" />
              <Tile label="Median" value={money(Math.round(stats.median))} />
              <Tile label="75th %ile" value={money(Math.round(stats.p75))} tone="accent" />
              <Tile label="95th %ile" value={money(Math.round(stats.p95))} tone="profit" />
              <Tile
                label="P(profit)"
                value={pct(stats.probProfit)}
                tone={stats.probProfit >= 0.5 ? "profit" : "warn"}
              />
            </div>
          )}

          {/* Chart */}
          <Card className="min-w-0">
            <CardHeader className="items-center">
              <div>
                <CardTitle>Monte Carlo simulation</CardTitle>
                <p className="mt-0.5 text-label text-ink-muted">
                  {SIMS.toLocaleString("en-US")} block-bootstrap paths ·{" "}
                  {result?.nTrades ?? returns.length} trades · axis is trade
                  number, not time
                </p>
              </div>
              <SegmentedControl
                options={["Equity", "Return %"] as const}
                value={mode}
                onChange={setMode}
                ariaLabel="Chart mode"
              />
            </CardHeader>
            <CardContent>
              {running && (
                <div className="flex flex-col items-center justify-center gap-3" style={{ height: H }}>
                  <div className="h-1 w-56 overflow-hidden rounded-full bg-raised">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-label text-ink-muted">
                    Running {SIMS.toLocaleString("en-US")} simulations…
                  </p>
                </div>
              )}
              {!running && result && (
                <CloudChart
                  result={result}
                  start={start}
                  mode={mode}
                  band={settings.band}
                  realised={realised}
                  showOverlay={settings.overlay}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* 7 — decision / interpretation rail */}
        <div className="min-w-0">
          <DecisionPanel position={position} cont={cont} model={settings.model} />
        </div>
      </section>

      {/* 3 — continuation */}
      {cont && <ContinuationCard cont={cont} rInfo={rInfo} />}

      {/* 4 — recovery curve */}
      {curve && curve.length > 0 && <RecoveryCurveCard curve={curve} />}

      {/* 5 — simulation metrics */}
      {stats && result && !running && (
        <Card>
          <CardHeader>
            <CardTitle>Simulation metrics</CardTitle>
            <span className="text-label text-ink-muted">
              Across {SIMS.toLocaleString("en-US")} paths · {MODEL_LABELS[result.model]}
            </span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label="Finishes profitable" value={pct(stats.probProfit)} tone="profit" />
              <Tile label="Reaches +5%" value={pct(stats.up5)} tone="profit" />
              <Tile label="Reaches +10%" value={pct(stats.up10)} tone="profit" />
              <Tile label="Breaches −5%" value={pct(stats.dn5)} tone="loss" />
              <Tile label="Breaches −10%" value={pct(stats.dn10)} tone="loss" />
              <Tile
                label="Expected max drawdown"
                value={`−${(stats.ddMedian * 100).toFixed(1)}%`}
                tone="loss"
                chip="median path"
              />
              <Tile
                label="Expected losing streak"
                value={`${Math.round(stats.streakMedian)} trades`}
                chip="median path"
              />
              <Tile
                label="Expected recovery time"
                value={
                  stats.recoveryMedian !== null
                    ? `${stats.recoveryMedian} trades`
                    : "—"
                }
                chip={
                  stats.neverRecovered > 0.02
                    ? `${pct(stats.neverRecovered)} never recover`
                    : undefined
                }
              />
              <Tile
                label="Expected return"
                value={`${stats.expReturnPct >= 0 ? "+" : "−"}${Math.abs(stats.expReturnPct).toFixed(1)}%`}
                tone={stats.expReturnPct >= 0 ? "profit" : "loss"}
                chip={rInfo(stats.expReturnPct) ?? undefined}
              />
              <Tile
                label="Expected CAGR"
                value={
                  stats.cagr !== null
                    ? `${stats.cagr >= 0 ? "+" : "−"}${Math.abs(stats.cagr).toFixed(1)}%`
                    : "—"
                }
                tone={(stats.cagr ?? 0) >= 0 ? "profit" : "loss"}
                chip={stats.cagr !== null ? "from historical pace" : undefined}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6 — historical explorer */}
      {cont && cont.periods.length > 0 && <HistoricalExplorer cont={cont} />}
    </>
  );
}
