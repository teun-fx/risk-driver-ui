"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { CROSSHAIR, usePlotHover } from "@/components/ui/chart-readout";
import {
  DateTicker,
  TooltipBox,
  TooltipContent,
} from "@/components/ui/area-chart";
import { equityRiskSeries, type Account } from "@/lib/data";
import { cn } from "@/lib/utils";

const Y_WIDTH = 56;
const MARGIN = { top: 4, right: 16, bottom: 0, left: 8 } as const;
const EQUITY_H = 280;
const UNDER_H = 120;
const MIN_WINDOW = 10; // fewest visible points when fully zoomed in

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function monthDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const signed = (v: number, dp = 2) =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`;

type LayerId = "stagnation" | "trend" | "drawdowns" | "highs" | "underwater";

const LAYERS: { id: LayerId; label: string }[] = [
  { id: "stagnation", label: "Stagnation periods" },
  { id: "trend", label: "Trend line" },
  { id: "drawdowns", label: "Worst 5 drawdowns" },
  { id: "highs", label: "New equity highs" },
  { id: "underwater", label: "Underwater panel" },
];

/**
 * Equity curve with the underwater plot stacked directly beneath it, sharing
 * one x-domain — the reference layout. Two measures of different scale get two
 * panels rather than a second y-axis. Annotation layers are switchable, and
 * the x-axis zooms TradingView-style: wheel zooms around the cursor, drag
 * pans, double-click resets.
 */
export function EquityRiskChart({ account }: { account: Account }) {
  const { points, bands, highs, stagnations, trend } = useMemo(
    () => equityRiskSeries(account),
    [account],
  );

  const [on, setOn] = useState<Record<LayerId, boolean>>({
    stagnation: true,
    trend: false,
    drawdowns: false,
    highs: false,
    underwater: true,
  });

  // Visible window as [start, end] indices into the full series.
  const N = points.length;
  const [win, setWin] = useState<[number, number]>([0, Math.max(N - 1, 0)]);
  // Reset the window when the account (and so the series) changes — the
  // render-time "adjust state on prop change" pattern, not an effect.
  const [prevPoints, setPrevPoints] = useState(points);
  if (prevPoints !== points) {
    setPrevPoints(points);
    setWin([0, Math.max(N - 1, 0)]);
  }
  const [a, b] = win;
  const zoomed = a > 0 || b < N - 1;

  // A "high" column so new peaks render as dots on an invisible line — far
  // cheaper than one ReferenceDot per peak on a multi-year series.
  const data = useMemo(() => {
    const set = new Set(highs);
    return points
      .slice(a, b + 1)
      .map((p) => ({ ...p, high: set.has(p.date) ? p.ret : null }));
  }, [points, highs, a, b]);

  const { index, handlers } = usePlotHover({
    count: data.length,
    padLeft: MARGIN.left + Y_WIDTH,
    padRight: MARGIN.right,
  });

  // Pixel geometry for the floating tooltip card + date pill.
  const [hoverPx, setHoverPx] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const plotHandlers = {
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => {
      handlers.onMouseMove(e);
      const r = e.currentTarget.getBoundingClientRect();
      setHoverPx({
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        w: r.width,
        h: r.height,
      });
    },
    onMouseLeave: () => {
      handlers.onMouseLeave();
      setHoverPx(null);
    },
  };

  // ---- Zoom & pan ------------------------------------------------------
  const plotRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; win: [number, number] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const winRef = useRef(win);
  useEffect(() => {
    winRef.current = win;
  }, [win]);

  // Wheel needs a non-passive listener to preventDefault page scroll.
  useEffect(() => {
    const el = plotRef.current;
    if (!el || N < 2) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const span = r.width - MARGIN.left - Y_WIDTH - MARGIN.right;
      const frac = Math.min(
        1,
        Math.max(0, (e.clientX - r.left - MARGIN.left - Y_WIDTH) / span),
      );
      const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      // Functional update so fast successive wheel events compound instead of
      // all reading the same pre-zoom window.
      setWin(([wa, wb]) => {
        const size = wb - wa;
        const next = Math.round(
          Math.min(N - 1, Math.max(MIN_WINDOW, size * factor)),
        );
        if (next === size) return [wa, wb];
        const anchor = wa + frac * size; // index under the cursor stays put
        let na = Math.round(anchor - frac * next);
        let nb = na + next;
        if (na < 0) {
          nb -= na;
          na = 0;
        }
        if (nb > N - 1) {
          na -= nb - (N - 1);
          nb = N - 1;
        }
        return [Math.max(0, na), Math.min(N - 1, nb)];
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [N]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { startX: e.clientX, win: winRef.current };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone (or synthetic) — drag still works via events */
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const el = plotRef.current;
    if (!el) return;
    const [wa, wb] = drag.current.win;
    const span =
      el.getBoundingClientRect().width - MARGIN.left - Y_WIDTH - MARGIN.right;
    const perPx = (wb - wa) / Math.max(span, 1);
    const shift = Math.round((drag.current.startX - e.clientX) * perPx);
    if (!shift) return;
    const size = wb - wa;
    let na = wa + shift;
    if (na < 0) na = 0;
    if (na + size > N - 1) na = N - 1 - size;
    setWin([na, na + size]);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture was never established */
    }
  };
  const reset = () => setWin([0, N - 1]);

  // ---- Visible-window derivations -------------------------------------
  const first = data[0]?.date;
  const lastD = data[data.length - 1]?.date;
  const clamp = (d: string) => (d < first ? first : d > lastD ? lastD : d);
  const visBand = (x: { from: string; to: string }) =>
    x.to >= first && x.from <= lastD
      ? { from: clamp(x.from), to: clamp(x.to) }
      : null;

  // Trend values at the visible endpoints, from the full-series line.
  const trendSeg = useMemo(() => {
    if (!trend || N < 2 || !data.length) return null;
    const at = (i: number) => trend.from + ((trend.to - trend.from) * i) / (N - 1);
    return {
      x1: data[0].date,
      y1: at(a),
      x2: data[data.length - 1].date,
      y2: at(b),
    };
  }, [trend, N, a, b, data]);

  // Zoomed-in windows need day-level ticks and finer y labels, or successive
  // ticks round to identical text.
  const spanDays = data.length
    ? (new Date(lastD).getTime() - new Date(first).getTime()) / 86_400_000
    : 0;
  const tickFmt = spanDays < 150 ? monthDay : monthYear;
  const retSpan =
    Math.max(...data.map((p) => p.ret)) - Math.min(...data.map((p) => p.ret));
  const retDp = retSpan < 6 ? 1 : 0;

  const hoverAt = index === null ? null : data[index];
  const dateLabels = useMemo(() => data.map((p) => monthDay(p.date)), [data]);
  const last = points[N - 1]?.ret ?? 0;
  const trough = Math.min(...data.map((p) => p.dd), 0);

  const xAxis = (visible: boolean) => (
    <XAxis
      dataKey="date"
      tickFormatter={tickFmt}
      tickLine={false}
      axisLine={false}
      minTickGap={60}
      tick={visible ? { fill: "var(--color-ink-muted)", fontSize: 11 } : false}
      height={visible ? 24 : 0}
      dy={6}
    />
  );

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Equity curve</CardTitle>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span
              className={cn("text-metric", last >= 0 ? "text-profit" : "text-loss")}
            >
              {signed(last, 1)}
            </span>
            <span className="text-label text-ink-muted">
              cumulative return · drawdown below · scroll to zoom, drag to pan
            </span>
          </div>
        </div>
        {zoomed && (
          <button
            type="button"
            onClick={reset}
            className={cn(
              "rounded-md border border-line bg-raised px-2.5 py-1 text-label font-medium text-ink-secondary",
              "transition-colors duration-150 ease-out hover:border-line-strong hover:text-ink",
            )}
          >
            Reset zoom
          </button>
        )}
      </CardHeader>

      <div className="flex min-w-0 flex-col gap-4 px-1 pb-3 lg:flex-row">
        <div
          ref={plotRef}
          className={cn(
            "relative min-w-0 flex-1 touch-none select-none",
            dragging ? "cursor-grabbing" : "cursor-crosshair",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={reset}
          {...plotHandlers}
        >
          <div style={{ height: EQUITY_H }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={MARGIN} syncId="equityRisk">
                <defs>
                  <linearGradient id="eqcFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  {/* Picture-3 stroke: the line fades out at both edges. */}
                  <linearGradient id="eqcStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    <stop offset="12%" stopColor="var(--color-chart-1)" stopOpacity={1} />
                    <stop offset="88%" stopColor="var(--color-chart-1)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="4 4" vertical={false} />
                {xAxis(!on.underwater)}
                <YAxis
                  tickFormatter={(v: number) => `${v.toFixed(retDp)}%`}
                  tickLine={false}
                  axisLine={false}
                  width={Y_WIDTH}
                  tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                  domain={["auto", "auto"]}
                />

                {/* Runs without a new high — all styled alike, each labelled. */}
                {on.stagnation &&
                  stagnations.map((s, i) => {
                    const v = visBand(s);
                    if (!v) return null;
                    return (
                      <ReferenceArea
                        key={`stag-${i}`}
                        x1={v.from}
                        x2={v.to}
                        fill="var(--color-loss)"
                        fillOpacity={0.09}
                        stroke="var(--color-loss)"
                        strokeOpacity={0.18}
                        label={{
                          value: `${s.days.toLocaleString("en-US")} days${s.ongoing ? " · ongoing" : ""}`,
                          position: "insideTop",
                          fill: "var(--color-ink-muted)",
                          fontSize: 10.5,
                          offset: 6,
                        }}
                      />
                    );
                  })}

                {on.drawdowns &&
                  bands.map((bd, i) => {
                    const v = visBand(bd);
                    if (!v) return null;
                    return (
                      <ReferenceArea
                        key={`dd-${i}`}
                        x1={v.from}
                        x2={v.to}
                        fill="var(--color-loss)"
                        fillOpacity={0.09}
                        stroke="var(--color-loss)"
                        strokeOpacity={0.18}
                      />
                    );
                  })}

                <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />

                {on.trend && trendSeg && (
                  <ReferenceLine
                    segment={[
                      { x: trendSeg.x1, y: trendSeg.y1 },
                      { x: trendSeg.x2, y: trendSeg.y2 },
                    ]}
                    stroke="var(--color-loss)"
                    strokeWidth={1.5}
                    strokeOpacity={0.75}
                  />
                )}

                {hoverAt && <ReferenceLine x={hoverAt.date} {...CROSSHAIR} />}

                <Area
                  type="monotone"
                  dataKey="ret"
                  stroke="url(#eqcStroke)"
                  strokeWidth={2}
                  fill="url(#eqcFill)"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />

                {on.highs && (
                  <Line
                    type="monotone"
                    dataKey="high"
                    stroke="none"
                    connectNulls={false}
                    dot={{ r: 2, fill: "var(--color-profit)", stroke: "none" }}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Underwater panel — same x-domain, hung from the zero line. */}
          {on.underwater && (
            <div style={{ height: UNDER_H }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={MARGIN} syncId="equityRisk">
                  <defs>
                    <linearGradient id="eqcUw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-loss)" stopOpacity={0.04} />
                      <stop offset="100%" stopColor="var(--color-loss)" stopOpacity={0.28} />
                    </linearGradient>
                    <linearGradient id="eqcUwStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--color-loss)" stopOpacity={0} />
                      <stop offset="12%" stopColor="var(--color-loss)" stopOpacity={1} />
                      <stop offset="88%" stopColor="var(--color-loss)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--color-loss)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="4 4" vertical={false} />
                  {xAxis(true)}
                  <YAxis
                    tickFormatter={(v: number) =>
                      `${v.toFixed(Math.abs(trough) < 5 ? 1 : 0)}%`
                    }
                    tickLine={false}
                    axisLine={false}
                    width={Y_WIDTH}
                    tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
                    domain={[() => trough * 1.15, 0]}
                  />
                  <ReferenceLine y={0} stroke="var(--color-line-strong)" strokeWidth={1} />
                  {hoverAt && <ReferenceLine x={hoverAt.date} {...CROSSHAIR} />}
                  <Area
                    type="monotone"
                    dataKey="dd"
                    stroke="url(#eqcUwStroke)"
                    strokeWidth={1.5}
                    fill="url(#eqcUw)"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Floating tooltip card + rolling date pill — picture-3 anatomy. */}
          {hoverAt && hoverPx && (
            <>
              <TooltipBox
                containerHeight={hoverPx.h}
                containerRef={plotRef}
                containerWidth={hoverPx.w}
                visible
                x={hoverPx.x}
                y={hoverPx.y}
              >
                <TooltipContent
                  title={fullDate(hoverAt.date)}
                  rows={[
                    {
                      color: "var(--color-chart-1)",
                      label: "Cumulative return",
                      value: signed(hoverAt.ret),
                    },
                    {
                      color: "var(--color-loss)",
                      label: "Below peak",
                      value:
                        hoverAt.dd >= -0.005
                          ? "At peak"
                          : `−${Math.abs(hoverAt.dd).toFixed(2)}%`,
                    },
                  ]}
                />
              </TooltipBox>
              <div
                className="pointer-events-none absolute z-50"
                style={{
                  left: hoverPx.x,
                  transform: "translateX(-50%)",
                  bottom: 4,
                }}
              >
                <DateTicker
                  currentIndex={index ?? 0}
                  labels={dateLabels}
                  visible
                />
              </div>
            </>
          )}
        </div>

        {/* Layer switches. */}
        <div className="shrink-0 lg:w-52 lg:border-l lg:border-line lg:pl-4">
          <p className="mb-1.5 text-eyebrow text-ink-muted">Layers</p>
          <div className="flex flex-wrap gap-x-4 lg:block">
            {LAYERS.map((l) => (
              <Toggle
                key={l.id}
                label={l.label}
                checked={on[l.id]}
                onChange={(v) => setOn((s) => ({ ...s, [l.id]: v }))}
              />
            ))}
          </div>
        </div>
      </div>

    </Card>
  );
}
