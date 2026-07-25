"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, SegmentedControl } from "@/components/ui/input";
import {
  probAtLeast,
  quantileSorted,
  runMonteCarlo,
  sortedCopy,
  type McResult,
} from "@/lib/monte-carlo";
import { tradeHistoryFor, type Account } from "@/lib/data";
import { cn, money } from "@/lib/utils";

const SIMS = 10_000;
const RISKS = ["Original", "0.25%", "0.5%", "0.75%", "1%", "1.5%", "2%", "Custom"] as const;
const TARGETS = ["5%", "10%", "15%", "20%", "Custom"] as const;
const DDS = ["5%", "10%", "15%", "20%", "Custom"] as const;
const PRESET_TARGETS = [0.05, 0.1, 0.15, 0.2];

type Settings = {
  seed: number;
  risk: (typeof RISKS)[number];
  customRisk: string;
  target: (typeof TARGETS)[number];
  customTarget: string;
  dd: (typeof DDS)[number];
  customDd: string;
};

const storageKey = (id: string) => `riskdriver.mc.v1.${id}`;

function freshSettings(): Settings {
  return {
    seed: (Math.random() * 0xffffffff) >>> 0,
    risk: "Original",
    customRisk: "1",
    target: "10%",
    customTarget: "25",
    dd: "10%",
    customDd: "25",
  };
}

/** Per-trade fractional returns in original order, plus the starting balance. */
function strategyReturns(account: Account) {
  const trades = [...tradeHistoryFor(account)].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const net = trades.reduce((a, t) => a + t.pnl, 0);
  // Imports carry their true starting balance; demos get the implied one.
  const start =
    account.startingBalance ?? Math.max(1000, account.equity - net);
  const returns = new Float32Array(trades.length);
  let eq = start;
  for (let i = 0; i < trades.length; i++) {
    returns[i] = eq > 0 ? trades[i].pnl / eq : 0;
    eq += trades[i].pnl;
  }
  // Historical pace, for the clearly-labelled calendar estimate.
  const spanDays =
    trades.length > 1
      ? (trades[trades.length - 1].date.getTime() - trades[0].date.getTime()) /
        86_400_000
      : 0;
  const tradesPerDay = spanDays >= 30 && trades.length >= 30 ? trades.length / spanDays : null;
  return { returns, start, tradesPerDay };
}

/* ================= canvas cloud chart ================= */

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Blend hex/#rgb-ish colors via canvas-friendly rgba mix of two hexes. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}
function mix(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(
    a[1] + (b[1] - a[1]) * t,
  )},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

type Mode = "Equity" | "Return %";

/* Chart geometry — module constants so effects don't chase a fresh object. */
const H = 340;
const PAD = { l: 56, r: 12, t: 10, b: 24 };

function CloudChart({
  result,
  start,
  mode,
}: {
  result: McResult;
  start: number;
  mode: Mode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cloudRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Y domain from the percentile envelope plus the extreme paths.
  const domain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < result.p5.length; i++) {
      lo = Math.min(lo, result.p5[i]);
      hi = Math.max(hi, result.p95[i]);
    }
    for (let i = 0; i < result.bestPath.length; i += 4) {
      hi = Math.max(hi, result.bestPath[i]);
      lo = Math.min(lo, result.worstPath[i]);
    }
    lo = Math.min(lo, start);
    hi = Math.max(hi, start);
    const pad = (hi - lo) * 0.04 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [result, start]);

  const toVal = useMemo(
    () =>
      mode === "Equity"
        ? (v: number) => v
        : (v: number) => ((v - start) / start) * 100,
    [mode, start],
  );

  // Static layer: grid, start line, and the 10,000-path cloud in rAF batches.
  useEffect(() => {
    const canvas = cloudRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const W = wrap.clientWidth;
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
    const x = (trade: number) =>
      PAD.l + ((W - PAD.l - PAD.r) * trade) / result.nTrades;
    const y = (v: number) =>
      PAD.t + (H - PAD.t - PAD.b) * (1 - (toVal(v) - vLo) / (vHi - vLo));

    // Grid + axis labels.
    const gridColor = cssVar("--color-chart-grid");
    const mutedColor = cssVar("--color-ink-muted");
    ctx.clearRect(0, 0, W, H);
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = mutedColor;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const ticks = 5;
    for (let g = 0; g <= ticks; g++) {
      const gy = PAD.t + ((H - PAD.t - PAD.b) * g) / ticks;
      ctx.beginPath();
      ctx.moveTo(PAD.l, gy);
      ctx.lineTo(W - PAD.r, gy);
      ctx.stroke();
      const val = vHi - ((vHi - vLo) * g) / ticks;
      const label =
        mode === "Equity"
          ? `${Math.round(val / 1000)}k`
          : `${Math.round(val)}%`;
      ctx.fillText(label, 8, gy + 4);
    }
    for (let g = 0; g <= 5; g++) {
      const trade = Math.round((result.nTrades * g) / 5);
      ctx.fillText(String(trade), x(trade) - 8, H - 8);
    }

    // Dashed starting-balance line, as in the reference.
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = mutedColor;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(start));
    ctx.lineTo(W - PAD.r, y(start));
    ctx.stroke();
    ctx.restore();

    // Cloud: all 10,000 paths, extremely thin and faint, in rAF batches so
    // the main thread never stalls.
    const S = result.cloudX.length;
    const cloudColor = cssVar("--color-chart-2");
    ctx.strokeStyle = cloudColor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.035;
    let s = 0;
    let raf = 0;
    const BATCH = 400;
    const drawBatch = () => {
      const end = Math.min(result.sims, s + BATCH);
      for (; s < end; s++) {
        ctx.beginPath();
        ctx.moveTo(x(0), y(start));
        for (let k = 0; k < S; k++) {
          ctx.lineTo(x(result.cloudX[k]), y(result.cloud[s * S + k]));
        }
        ctx.stroke();
      }
      if (s < result.sims) raf = requestAnimationFrame(drawBatch);
      else ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(drawBatch);
    return () => cancelAnimationFrame(raf);
     
  }, [result, mode, domain, toVal, start]);

  // FX layer: highlighted paths with stagnation tint, crosshair on hover.
  useEffect(() => {
    const canvas = fxRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const W = wrap.clientWidth;
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
    const x = (trade: number) =>
      PAD.l + ((W - PAD.l - PAD.r) * trade) / result.nTrades;
    const y = (v: number) =>
      PAD.t + (H - PAD.t - PAD.b) * (1 - (toVal(v) - vLo) / (vHi - vLo));

    ctx.clearRect(0, 0, W, H);

    const warn = hexToRgb(cssVar("--color-warn"));
    /** Draw a path, tinting toward amber the longer it sits below its peak —
        the spec's progressive stagnation colour. */
    const drawPath = (path: Float32Array, baseVar: string, width: number) => {
      const base = hexToRgb(cssVar(baseVar));
      let peak = -Infinity;
      let uw = 0;
      const maxUw = Math.max(30, result.nTrades / 4);
      ctx.lineWidth = width;
      for (let i = 1; i < path.length; i++) {
        if (path[i] >= peak) {
          peak = path[i];
          uw = 0;
        } else uw++;
        ctx.strokeStyle = mix(base, warn, Math.min(0.85, uw / maxUw));
        ctx.beginPath();
        ctx.moveTo(x(i - 1), y(path[i - 1]));
        ctx.lineTo(x(i), y(path[i]));
        ctx.stroke();
      }
    };
    drawPath(result.avgPath, "--color-accent", 2);
    drawPath(result.bestPath, "--color-profit", 1.75);
    drawPath(result.worstPath, "--color-loss", 1.75);

    if (hover !== null) {
      ctx.strokeStyle = cssVar("--color-line-strong");
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x(hover), PAD.t);
      ctx.lineTo(x(hover), H - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [path, colorVar] of [
        [result.bestPath, "--color-profit"],
        [result.avgPath, "--color-accent"],
        [result.worstPath, "--color-loss"],
      ] as const) {
        ctx.fillStyle = cssVar(colorVar);
        ctx.beginPath();
        ctx.arc(x(hover), y(path[hover]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [result, mode, domain, toVal, hover, start]);

  const onMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const W = rect.width;
    const rel = (e.clientX - rect.left - PAD.l) / (W - PAD.l - PAD.r);
    const idx = Math.round(rel * result.nTrades);
    setHover(idx >= 0 && idx <= result.nTrades ? idx : null);
  };

  const fmt = (v: number) =>
    mode === "Equity"
      ? money(Math.round(v))
      : `${(((v - start) / start) * 100).toFixed(1)}%`;
  const h = hover ?? result.nTrades;

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

      {/* Hover readout — the crosshair's numbers, always legible. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-1 pt-3">
        <span className="text-label tnum text-ink-muted">
          Trade {h.toLocaleString("en-US")}
        </span>
        <Readout label="Best" colorVar="--color-profit" value={fmt(result.bestPath[h])} />
        <Readout label="Average" colorVar="--color-accent" value={fmt(result.avgPath[h])} />
        <Readout label="Worst" colorVar="--color-loss" value={fmt(result.worstPath[h])} />
        <span className="ml-auto hidden text-[11.5px] text-ink-muted sm:block">
          Amber tint = time spent below the path&apos;s own peak
        </span>
      </div>
    </div>
  );
}

function Readout({
  label,
  colorVar,
  value,
}: {
  label: string;
  colorVar: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-0.5 w-4 rounded-full"
        style={{ background: `var(${colorVar})` }}
        aria-hidden
      />
      <span className="text-label text-ink-secondary">{label}</span>
      <span className="text-label tnum font-medium text-ink">{value}</span>
    </span>
  );
}

/* ================= small building blocks ================= */

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

/** Compact vertical histogram from a metric array. */
function Histogram({
  values,
  bins = 15,
  colorVar,
  format,
}: {
  values: ArrayLike<number>;
  bins?: number;
  colorVar: string;
  format: (v: number) => string;
}) {
  const { bars, lo, hi } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < values.length; i++) {
      lo = Math.min(lo, values[i]);
      hi = Math.max(hi, values[i]);
    }
    if (!isFinite(lo)) return { bars: [] as number[], lo: 0, hi: 0 };
    const span = hi - lo || 1;
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < values.length; i++) {
      counts[Math.min(bins - 1, Math.floor(((values[i] - lo) / span) * bins))]++;
    }
    const max = Math.max(...counts, 1);
    return { bars: counts.map((c) => c / max), lo, hi };
  }, [values, bins]);

  return (
    <div>
      <div className="flex h-20 items-end gap-[3px]">
        {bars.map((b, i) => (
          <div
            key={i}
            className="min-w-0 flex-1 rounded-t-xs"
            style={{
              height: `${Math.max(2, b * 100)}%`,
              background: `var(${colorVar})`,
              opacity: 0.35 + b * 0.55,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] tnum text-ink-muted">
        <span>{format(lo)}</span>
        <span>{format(hi)}</span>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "loss" | "profit" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-0 last:pb-0">
      <span className="text-label text-ink-secondary">{label}</span>
      <span
        className={cn(
          "text-body font-semibold tnum",
          tone === "loss"
            ? "text-loss"
            : tone === "profit"
              ? "text-profit"
              : tone === "warn"
                ? "text-warn"
                : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ================= the tab ================= */

export function MonteCarloTab({ account }: { account: Account }) {
  const { returns, start, tradesPerDay } = useMemo(
    () => strategyReturns(account),
    [account],
  );
  const originalRisk = account.riskPerTrade;

  const [settings, setSettings] = useState<Settings>(freshSettings);
  const [result, setResult] = useState<McResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("Equity");
  const runRef = useRef<{ cancel: () => void } | null>(null);

  // Restore persisted settings (incl. seed) per account — reproducible runs.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(account.id));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only hydration of persisted settings
      setSettings(raw ? { ...freshSettings(), ...JSON.parse(raw) } : freshSettings());
    } catch {
      /* fresh settings stand */
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

  const customTargetFrac = (parseFloat(settings.customTarget) || 25) / 100;
  const targets = useMemo(
    () => [...PRESET_TARGETS, customTargetFrac],
    [customTargetFrac],
  );

  // Run the simulation — on seed / risk / custom-target change only, never on
  // unrelated renders. Results arrive from the worker asynchronously.
  useEffect(() => {
    if (returns.length < 20) return;
    runRef.current?.cancel();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flags the async worker run this effect launches
    setRunning(true);
    setProgress(0);
    const run = runMonteCarlo(
      {
        returns,
        startBalance: start,
        seed: settings.seed,
        scale: riskScale,
        targets,
        sims: SIMS,
      },
      (done, total) => setProgress(done / total),
    );
    runRef.current = run;
    run.promise
      .then((res) => {
        setResult(res);
        setRunning(false);
        try {
          localStorage.setItem(storageKey(account.id), JSON.stringify(settings));
        } catch {
          /* ignore */
        }
      })
      .catch(() => setRunning(false));
    return () => run.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returns, start, settings.seed, riskScale, customTargetFrac]);

  /* -------- derived metrics -------- */
  const stats = useMemo(() => {
    if (!result) return null;
    const finals = sortedCopy(result.finals);
    const dd = sortedCopy(result.maxDD);
    const streak = sortedCopy(result.streaks);
    const stag = sortedCopy(result.stagnation);
    let meanFinal = 0;
    for (let i = 0; i < result.finals.length; i++) meanFinal += result.finals[i];
    meanFinal /= result.finals.length;

    const targetIdx =
      settings.target === "Custom"
        ? PRESET_TARGETS.length
        : TARGETS.indexOf(settings.target);
    const tFrac = settings.target === "Custom" ? customTargetFrac : PRESET_TARGETS[targetIdx];
    const P = result.sims;
    const hits: number[] = [];
    for (let s = 0; s < P; s++) {
      const h = result.hitSteps[targetIdx * P + s];
      if (h >= 0) hits.push(h);
    }
    hits.sort((a, b) => a - b);

    const ddThreshold =
      settings.dd === "Custom"
        ? (parseFloat(settings.customDd) || 25) / 100
        : parseFloat(settings.dd) / 100;

    let uwCount = 0;
    for (let i = 0; i < result.endUnderwater.length; i++)
      uwCount += result.endUnderwater[i];

    return {
      finals,
      dd,
      streak,
      stag,
      meanFinal,
      medianFinal: quantileSorted(finals, 0.5),
      p5: quantileSorted(finals, 0.05),
      p25: quantileSorted(finals, 0.25),
      p75: quantileSorted(finals, 0.75),
      p95: quantileSorted(finals, 0.95),
      probProfit: probAtLeast(result.finals, start * 1.000001),
      dd50: quantileSorted(dd, 0.5),
      dd90: quantileSorted(dd, 0.9),
      dd95: quantileSorted(dd, 0.95),
      ddWorst: dd[dd.length - 1] ?? 0,
      ddProb: probAtLeast(result.maxDD, ddThreshold),
      ddThreshold,
      streak50: quantileSorted(streak, 0.5),
      streak90: quantileSorted(streak, 0.9),
      streak95: quantileSorted(streak, 0.95),
      streakMax: streak[streak.length - 1] ?? 0,
      streakProbs: [3, 5, 7, 10].map((k) => probAtLeast(result.streaks, k)),
      stag50: quantileSorted(stag, 0.5),
      stag95: quantileSorted(stag, 0.95),
      stagMax: stag[stag.length - 1] ?? 0,
      endUnderwaterPct: uwCount / P,
      tFrac,
      probReach: hits.length / P,
      probFinishAbove: probAtLeast(result.finals, start * (1 + tFrac)),
      medianTradesToHit: hits.length
        ? hits[Math.floor(hits.length / 2)]
        : null,
    };
  }, [result, settings.target, settings.dd, settings.customDd, customTargetFrac, start]);

  const rangeData = useMemo(() => {
    if (!result) return [];
    return Array.from(result.cloudX).map((t, k) => ({
      t,
      med: result.p50[k],
      inner: [result.p25[k], result.p75[k]],
      outer: [result.p5[k], result.p95[k]],
    }));
  }, [result]);

  if (returns.length < 20) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-center">
          <p className="max-w-sm text-label text-ink-muted">
            Monte Carlo needs at least 20 closed trades. Import a fuller
            statement to simulate this strategy.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const estDays = (trades: number) =>
    tradesPerDay ? Math.round(trades / tradesPerDay) : null;

  return (
    <>
      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4 pt-5">
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
                  Original only — no risk-per-trade is set for this account, and
                  we never invent one.
                </p>
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-[10.5px] text-ink-muted">
              seed {settings.seed.toString(16)}
            </span>
            <Button
              variant="primary"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  seed: (Math.random() * 0xffffffff) >>> 0,
                }))
              }
              disabled={running}
            >
              <RefreshCw className={cn(running && "animate-spin")} aria-hidden />
              Run new simulation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Percentile tiles — the reference's headline row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Tile label="Starting" value={money(Math.round(start))} />
          <Tile label="5th %ile" value={money(Math.round(stats.p5))} chip="Worst case" tone="loss" />
          <Tile label="25th %ile" value={money(Math.round(stats.p25))} tone="warn" />
          <Tile label="Median" value={money(Math.round(stats.medianFinal))} chip="Expected" />
          <Tile label="75th %ile" value={money(Math.round(stats.p75))} tone="accent" />
          <Tile label="95th %ile" value={money(Math.round(stats.p95))} chip="Best case" tone="profit" />
        </div>
      )}

      {/* Main cloud chart */}
      <Card className="min-w-0">
        <CardHeader className="items-center">
          <div>
            <CardTitle>Monte Carlo simulation</CardTitle>
            <p className="mt-0.5 text-label text-ink-muted">
              {SIMS.toLocaleString("en-US")} resamples of {result?.nTrades ?? returns.length}{" "}
              trades · horizontal axis is trade number, not time
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
            <div className="flex h-[340px] flex-col items-center justify-center gap-3">
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
            <CloudChart result={result} start={start} mode={mode} />
          )}
        </CardContent>
      </Card>

      {/* Percentile range chart */}
      {result && !running && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Equity range</CardTitle>
            <span className="text-label text-ink-muted">
              Median · 25–75 · 5–95 percentile bands per trade number
            </span>
          </CardHeader>
          <div className="h-[240px] w-full min-w-0 px-1 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rangeData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={50}
                  tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                  dy={6}
                />
                <YAxis
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop">
                        <p className="text-label text-ink-muted">Trade {label}</p>
                        <div className="mt-1.5 space-y-1 text-label tnum">
                          <p className="text-ink">Median {money(Math.round(d.med))}</p>
                          <p className="text-ink-secondary">
                            25–75: {money(Math.round(d.inner[0]))} – {money(Math.round(d.inner[1]))}
                          </p>
                          <p className="text-ink-muted">
                            5–95: {money(Math.round(d.outer[0]))} – {money(Math.round(d.outer[1]))}
                          </p>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area dataKey="outer" stroke="none" fill="var(--color-chart-2)" fillOpacity={0.12} isAnimationActive={false} />
                <Area dataKey="inner" stroke="none" fill="var(--color-chart-2)" fillOpacity={0.22} isAnimationActive={false} />
                <Line dataKey="med" stroke="var(--color-accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Metric panels */}
      {stats && result && !running && (
        <>
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                <Histogram
                  values={result.finals}
                  colorVar="--color-chart-2"
                  format={(v) => money(Math.round(v))}
                />
                <div className="mt-4">
                  <StatRow label="Median final equity" value={money(Math.round(stats.medianFinal))} />
                  <StatRow label="Mean final equity" value={money(Math.round(stats.meanFinal))} />
                  <StatRow label="5th percentile" value={money(Math.round(stats.p5))} tone="loss" />
                  <StatRow label="95th percentile" value={money(Math.round(stats.p95))} tone="profit" />
                  <StatRow label="Finishes profitable" value={pct(stats.probProfit)} tone="profit" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Max drawdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Histogram
                  values={result.maxDD}
                  colorVar="--color-loss"
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <div className="mt-4">
                  <StatRow label="Median" value={`−${(stats.dd50 * 100).toFixed(1)}%`} tone="loss" />
                  <StatRow label="90th percentile" value={`−${(stats.dd90 * 100).toFixed(1)}%`} tone="loss" />
                  <StatRow label="95th percentile" value={`−${(stats.dd95 * 100).toFixed(1)}%`} tone="loss" />
                  <StatRow label="Worst simulation" value={`−${(stats.ddWorst * 100).toFixed(1)}%`} tone="loss" />
                </div>
                <div className="mt-4 border-t border-line pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SegmentedControl
                      options={DDS}
                      value={settings.dd}
                      onChange={(dd) => setSettings((s) => ({ ...s, dd }))}
                      ariaLabel="Drawdown threshold"
                    />
                    {settings.dd === "Custom" && (
                      <Input
                        value={settings.customDd}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, customDd: e.target.value }))
                        }
                        inputMode="decimal"
                        className="w-16"
                        aria-label="Custom drawdown percent"
                      />
                    )}
                  </div>
                  <StatRow
                    label={`P(drawdown ≥ ${(stats.ddThreshold * 100).toFixed(0)}%)`}
                    value={pct(stats.ddProb)}
                    tone={stats.ddProb > 0.5 ? "loss" : "warn"}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Losing streaks</CardTitle>
              </CardHeader>
              <CardContent>
                <Histogram
                  values={result.streaks}
                  colorVar="--color-warn"
                  format={(v) => `${Math.round(v)}`}
                />
                <div className="mt-4">
                  <StatRow label="Median" value={`${Math.round(stats.streak50)} losses`} />
                  <StatRow label="90th percentile" value={`${Math.round(stats.streak90)} losses`} />
                  <StatRow label="95th percentile" value={`${Math.round(stats.streak95)} losses`} tone="warn" />
                  <StatRow label="Maximum" value={`${Math.round(stats.streakMax)} losses`} tone="loss" />
                </div>
                <div className="mt-4 border-t border-line pt-2">
                  {[3, 5, 7, 10].map((k, i) => (
                    <StatRow
                      key={k}
                      label={`P(≥ ${k} in a row)`}
                      value={pct(stats.streakProbs[i])}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Return target</CardTitle>
                <div className="flex items-center gap-2">
                  <SegmentedControl
                    options={TARGETS}
                    value={settings.target}
                    onChange={(target) => setSettings((s) => ({ ...s, target }))}
                    ariaLabel="Return target"
                  />
                  {settings.target === "Custom" && (
                    <Input
                      value={settings.customTarget}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, customTarget: e.target.value }))
                      }
                      inputMode="decimal"
                      className="w-16"
                      aria-label="Custom target percent"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <StatRow
                  label={`Reaches +${(stats.tFrac * 100).toFixed(0)}% at any point`}
                  value={pct(stats.probReach)}
                  tone="profit"
                />
                <StatRow
                  label={`Finishes above +${(stats.tFrac * 100).toFixed(0)}%`}
                  value={pct(stats.probFinishAbove)}
                />
                <StatRow
                  label="Median trades to reach it"
                  value={
                    stats.medianTradesToHit
                      ? `${stats.medianTradesToHit} trades${
                          estDays(stats.medianTradesToHit)
                            ? ` (≈ ${estDays(stats.medianTradesToHit)} days, est.)`
                            : ""
                        }`
                      : "Rarely reached"
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stagnation</CardTitle>
                <span className="text-label text-ink-muted">
                  Trades spent below the running equity peak
                </span>
              </CardHeader>
              <CardContent>
                <Histogram
                  values={result.stagnation}
                  colorVar="--color-chart-2"
                  format={(v) => `${Math.round(v)}`}
                />
                <div className="mt-4">
                  <StatRow
                    label="Median longest stagnation"
                    value={`${Math.round(stats.stag50)} trades${
                      estDays(stats.stag50) ? ` (≈ ${estDays(stats.stag50)} days, est.)` : ""
                    }`}
                  />
                  <StatRow
                    label="95th percentile"
                    value={`${Math.round(stats.stag95)} trades${
                      estDays(stats.stag95) ? ` (≈ ${estDays(stats.stag95)} days, est.)` : ""
                    }`}
                    tone="warn"
                  />
                  <StatRow label="Maximum" value={`${Math.round(stats.stagMax)} trades`} tone="loss" />
                  <StatRow
                    label="Finishes underwater"
                    value={pct(stats.endUnderwaterPct)}
                  />
                </div>
                {tradesPerDay && (
                  <p className="mt-3 text-[11.5px] text-ink-muted">
                    Day figures are estimates from this strategy&apos;s historical
                    pace (~{tradesPerDay.toFixed(2)} trades/day) — the simulation
                    itself has no calendar.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
