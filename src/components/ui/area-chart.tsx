"use client";

/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect --
   Vendored port of the reference visx/motion chart. Its animation model
   measures SVG path length through refs during render and commits measured
   sizes in effects by design; restructuring it would fork the library. */

/**
 * Picture-3 chart kit — a port of the reference visx/motion area chart onto
 * the app's tokens. Three deliberate changes from the source:
 *   1. `cn` comes from lib/utils (the app already has one);
 *   2. the y-domain spans min→max with padding instead of 0→max — these are
 *      equity series, and anchoring at zero would flatten them to a line;
 *   3. `height` prop for fixed-height cards (the source only had aspectRatio).
 * Colours resolve through --chart-* vars defined in globals.css.
 */

import { localPoint } from "@visx/event";
import { curveMonotoneX } from "@visx/curve";
import { GridRows } from "@visx/grid";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { bisector } from "d3-array";
import { motion, useMotionTemplate, useSpring } from "motion/react";
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import useMeasure from "react-use-measure";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- d3 curve factory type
type CurveFactory = any;

export const chartCssVars = {
  background: "var(--chart-background)",
  linePrimary: "var(--chart-line-primary)",
  lineSecondary: "var(--chart-line-secondary)",
  crosshair: "var(--chart-crosshair)",
  grid: "var(--chart-grid)",
};

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TooltipData {
  point: Record<string, unknown>;
  index: number;
  x: number;
  yPositions: Record<string, number>;
}

export interface LineConfig {
  dataKey: string;
  stroke: string;
  strokeWidth: number;
}

interface ChartContextValue {
  data: Record<string, unknown>[];
  xScale: ReturnType<typeof scaleTime<number>>;
  yScale: ReturnType<typeof scaleLinear<number>>;
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;
  columnWidth: number;
  tooltipData: TooltipData | null;
  setTooltipData: Dispatch<SetStateAction<TooltipData | null>>;
  containerRef: RefObject<HTMLDivElement | null>;
  lines: LineConfig[];
  isLoaded: boolean;
  animationDuration: number;
  xAccessor: (d: Record<string, unknown>) => Date;
  dateLabels: string[];
}

const ChartContext = createContext<ChartContextValue | null>(null);

function useChart(): ChartContextValue {
  const context = useContext(ChartContext);
  if (!context)
    throw new Error("useChart must be used within an <AreaChart>.");
  return context;
}

/* ─── Interaction ────────────────────────────────────────────────────── */

function useChartInteraction({
  xScale,
  yScale,
  data,
  lines,
  margin,
  xAccessor,
  bisectDate,
  canInteract,
}: {
  xScale: ReturnType<typeof scaleTime<number>>;
  yScale: ReturnType<typeof scaleLinear<number>>;
  data: Record<string, unknown>[];
  lines: LineConfig[];
  margin: Margin;
  xAccessor: (d: Record<string, unknown>) => Date;
  bisectDate: (data: Record<string, unknown>[], date: Date, lo: number) => number;
  canInteract: boolean;
}) {
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);

  const resolveTooltipFromX = useCallback(
    (pixelX: number): TooltipData | null => {
      const x0 = xScale.invert(pixelX);
      const index = bisectDate(data, x0, 1);
      const d0 = data[index - 1];
      const d1 = data[index];
      if (!d0) return null;

      let d = d0;
      let finalIndex = index - 1;
      if (d1) {
        const d0Time = xAccessor(d0).getTime();
        const d1Time = xAccessor(d1).getTime();
        if (x0.getTime() - d0Time > d1Time - x0.getTime()) {
          d = d1;
          finalIndex = index;
        }
      }

      const yPositions: Record<string, number> = {};
      for (const line of lines) {
        const value = d[line.dataKey];
        if (typeof value === "number") yPositions[line.dataKey] = yScale(value) ?? 0;
      }

      return { point: d, index: finalIndex, x: xScale(xAccessor(d)) ?? 0, yPositions };
    },
    [xScale, yScale, data, lines, xAccessor, bisectDate],
  );

  const getChartX = useCallback(
    (event: React.MouseEvent<SVGGElement> | React.TouchEvent<SVGGElement>): number | null => {
      let point: { x: number; y: number } | null = null;
      if ("touches" in event) {
        const touch = event.touches[0];
        if (!touch) return null;
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) return null;
        point = localPoint(svg, touch as unknown as MouseEvent);
      } else {
        point = localPoint(event);
      }
      if (!point) return null;
      return point.x - margin.left;
    },
    [margin.left],
  );

  const handleMove = useCallback(
    (event: React.MouseEvent<SVGGElement> | React.TouchEvent<SVGGElement>) => {
      const chartX = getChartX(event);
      if (chartX === null) return;
      const tooltip = resolveTooltipFromX(chartX);
      if (tooltip) setTooltipData(tooltip);
    },
    [getChartX, resolveTooltipFromX],
  );

  const handleLeave = useCallback(() => setTooltipData(null), []);

  const interactionHandlers = canInteract
    ? {
        onMouseMove: handleMove,
        onMouseLeave: handleLeave,
        onTouchStart: handleMove,
        onTouchMove: handleMove,
        onTouchEnd: handleLeave,
      }
    : {};

  return {
    tooltipData,
    setTooltipData,
    interactionHandlers,
    interactionStyle: {
      cursor: canInteract ? "crosshair" : "default",
      touchAction: "none",
    } as React.CSSProperties,
  };
}

/* ─── DateTicker — the rolling date pill under the crosshair ─────────── */

const TICKER_ITEM_HEIGHT = 24;

export function DateTicker({
  currentIndex,
  labels,
  visible,
}: {
  currentIndex: number;
  labels: string[];
  visible: boolean;
}) {
  const parsedLabels = useMemo(
    () =>
      labels.map((label) => {
        const parts = label.split(" ");
        return { month: parts[0] || "", day: parts[1] || "" };
      }),
    [labels],
  );

  // Month SEGMENTS, not unique names — "Jul" recurs on multi-year series and
  // must scroll to the right occurrence, so each run keeps its start index.
  const monthSegments = useMemo(() => {
    const segments: { month: string; startIdx: number }[] = [];
    parsedLabels.forEach((label, i) => {
      if (segments.length === 0 || segments.at(-1)!.month !== label.month)
        segments.push({ month: label.month, startIdx: i });
    });
    return segments;
  }, [parsedLabels]);

  const currentMonthIndex = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= parsedLabels.length) return 0;
    let idx = 0;
    monthSegments.forEach((seg, i) => {
      if (seg.startIdx <= currentIndex) idx = i;
    });
    return idx;
  }, [currentIndex, parsedLabels.length, monthSegments]);

  const prevMonthIndexRef = useRef(-1);
  const dayY = useSpring(0, { stiffness: 400, damping: 35 });
  const monthY = useSpring(0, { stiffness: 400, damping: 35 });

  useEffect(() => {
    dayY.set(-currentIndex * TICKER_ITEM_HEIGHT);
  }, [currentIndex, dayY]);

  useEffect(() => {
    if (currentMonthIndex >= 0 && prevMonthIndexRef.current !== currentMonthIndex) {
      monthY.set(-currentMonthIndex * TICKER_ITEM_HEIGHT);
      prevMonthIndexRef.current = currentMonthIndex;
    }
  }, [currentMonthIndex, monthY]);

  if (!visible || labels.length === 0) return null;

  return (
    <motion.div
      // Dark-only app: the pill flips to near-white ink on the dark ground.
      className="overflow-hidden rounded-full bg-ink px-4 py-1 text-(--color-base) shadow-pop"
      layout
      transition={{ layout: { type: "spring", stiffness: 400, damping: 35 } }}
    >
      <div className="relative h-6 overflow-hidden">
        <div className="flex items-center justify-center gap-1">
          <div className="relative h-6 overflow-hidden">
            <motion.div className="flex flex-col" style={{ y: monthY }}>
              {monthSegments.map((seg) => (
                <div
                  className="flex h-6 shrink-0 items-center justify-center"
                  key={seg.startIdx}
                >
                  <span className="text-sm font-medium whitespace-nowrap">{seg.month}</span>
                </div>
              ))}
            </motion.div>
          </div>
          <div className="relative h-6 overflow-hidden">
            <motion.div className="flex flex-col" style={{ y: dayY }}>
              {parsedLabels.map((label, index) => (
                <div
                  className="flex h-6 shrink-0 items-center justify-center"
                  key={`${label.day}-${index}`}
                >
                  <span className="text-sm font-medium whitespace-nowrap">{label.day}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Tooltip pieces ─────────────────────────────────────────────────── */

function TooltipDot({
  x,
  y,
  visible,
  color,
}: {
  x: number;
  y: number;
  visible: boolean;
  color: string;
}) {
  const springConfig = { stiffness: 300, damping: 30 };
  const animatedX = useSpring(x, springConfig);
  const animatedY = useSpring(y, springConfig);

  useEffect(() => {
    animatedX.set(x);
    animatedY.set(y);
  }, [x, y, animatedX, animatedY]);

  if (!visible) return null;

  return (
    <motion.circle
      cx={animatedX}
      cy={animatedY}
      fill={color}
      r={5}
      stroke={chartCssVars.background}
      strokeWidth={2}
    />
  );
}

function TooltipIndicator({
  x,
  height,
  visible,
  gradientId,
}: {
  x: number;
  height: number;
  visible: boolean;
  gradientId: string;
}) {
  const springConfig = { stiffness: 300, damping: 30 };
  const animatedX = useSpring(x - 0.5, springConfig);

  useEffect(() => {
    animatedX.set(x - 0.5);
  }, [x, animatedX]);

  if (!visible) return null;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: chartCssVars.crosshair, stopOpacity: 0 }} />
          <stop offset="10%" style={{ stopColor: chartCssVars.crosshair, stopOpacity: 1 }} />
          <stop offset="90%" style={{ stopColor: chartCssVars.crosshair, stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: chartCssVars.crosshair, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <motion.rect fill={`url(#${gradientId})`} height={height} width={1} x={animatedX} y={0} />
    </g>
  );
}

export interface TooltipRow {
  color: string;
  label: string;
  value: string | number;
}

export function TooltipContent({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  const [measureRef, bounds] = useMeasure({ debounce: 0, scroll: false });
  const [committedHeight, setCommittedHeight] = useState<number | null>(null);

  useEffect(() => {
    if (bounds.height > 0) setCommittedHeight(bounds.height);
  }, [bounds.height]);

  return (
    <motion.div
      animate={committedHeight !== null ? { height: committedHeight } : undefined}
      className="overflow-hidden"
      initial={false}
      transition={
        committedHeight !== null
          ? { type: "spring", stiffness: 500, damping: 35, mass: 0.8 }
          : { duration: 0 }
      }
    >
      <div className="px-3 py-2.5" ref={measureRef}>
        {title && <div className="mb-2 text-label font-medium text-ink">{title}</div>}
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              className="flex items-center justify-between gap-4"
              key={`${row.label}-${row.color}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="text-label text-ink-secondary">{row.label}</span>
              </div>
              <span className="text-label font-medium tnum text-ink">
                {typeof row.value === "number" ? row.value.toLocaleString() : row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function TooltipBox({
  x,
  y,
  visible,
  containerRef,
  containerWidth,
  containerHeight,
  offset = 16,
  children,
}: {
  x: number;
  y: number;
  visible: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  containerWidth: number;
  containerHeight: number;
  offset?: number;
  children: ReactNode;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipWidth, setTooltipWidth] = useState(180);
  const [tooltipHeight, setTooltipHeight] = useState(80);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const w = tooltipRef.current.offsetWidth;
      const h = tooltipRef.current.offsetHeight;
      if (w > 0 && w !== tooltipWidth) setTooltipWidth(w);
      if (h > 0 && h !== tooltipHeight) setTooltipHeight(h);
    }
  }, [tooltipWidth, tooltipHeight]);

  const shouldFlipX = x + tooltipWidth + offset > containerWidth;
  const targetX = shouldFlipX ? x - offset - tooltipWidth : x + offset;
  const targetY = Math.max(
    offset,
    Math.min(y - tooltipHeight / 2, containerHeight - tooltipHeight - offset),
  );

  const prevFlipRef = useRef(shouldFlipX);
  const [flipKey, setFlipKey] = useState(0);

  useEffect(() => {
    if (prevFlipRef.current !== shouldFlipX) {
      setFlipKey((k) => k + 1);
      prevFlipRef.current = shouldFlipX;
    }
  }, [shouldFlipX]);

  const springConfig = { stiffness: 100, damping: 20 };
  const animatedLeft = useSpring(targetX, springConfig);
  const animatedTop = useSpring(targetY, springConfig);

  useEffect(() => {
    animatedLeft.set(targetX);
  }, [targetX, animatedLeft]);
  useEffect(() => {
    animatedTop.set(targetY);
  }, [targetY, animatedTop]);

  const container = containerRef.current;
  if (!(mounted && container) || !visible) return null;

  return createPortal(
    <motion.div
      animate={{ opacity: 1 }}
      className="pointer-events-none absolute z-50"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      ref={tooltipRef}
      style={{ left: animatedLeft, top: animatedTop }}
      transition={{ duration: 0.1 }}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1, x: 0 }}
        className="min-w-[140px] overflow-hidden rounded-lg border border-line bg-overlay/90 shadow-pop backdrop-blur-md"
        initial={{ scale: 0.85, opacity: 0, x: shouldFlipX ? 20 : -20 }}
        key={flipKey}
        style={{ transformOrigin: shouldFlipX ? "right top" : "left top" }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {children}
      </motion.div>
    </motion.div>,
    container,
  );
}

export function ChartTooltip({
  showDatePill = true,
  showCrosshair = true,
  showDots = true,
  rows: rowsRenderer,
}: {
  showDatePill?: boolean;
  showCrosshair?: boolean;
  showDots?: boolean;
  rows?: (point: Record<string, unknown>) => TooltipRow[];
}) {
  const {
    tooltipData,
    width,
    height,
    innerHeight,
    margin,
    lines,
    xAccessor,
    dateLabels,
    containerRef,
  } = useChart();

  const uniqueId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const visible = tooltipData !== null;
  const x = tooltipData?.x ?? 0;
  const xWithMargin = x + margin.left;

  const springConfig = { stiffness: 300, damping: 30 };
  const animatedX = useSpring(xWithMargin, springConfig);
  useEffect(() => {
    animatedX.set(xWithMargin);
  }, [xWithMargin, animatedX]);

  const tooltipRows = useMemo(() => {
    if (!tooltipData) return [];
    if (rowsRenderer) return rowsRenderer(tooltipData.point);
    return lines.map((line) => ({
      color: line.stroke,
      label: line.dataKey,
      value: (tooltipData.point[line.dataKey] as number) ?? 0,
    }));
  }, [tooltipData, lines, rowsRenderer]);

  const title = useMemo(() => {
    if (!tooltipData) return undefined;
    return xAccessor(tooltipData.point).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, [tooltipData, xAccessor]);

  const container = containerRef.current;
  if (!(mounted && container)) return null;

  return createPortal(
    <>
      {showCrosshair && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            <TooltipIndicator
              gradientId={`crosshair-${uniqueId}`}
              height={innerHeight}
              visible={visible}
              x={x}
            />
          </g>
        </svg>
      )}

      {showDots && visible && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {lines.map((line) => (
              <TooltipDot
                color={line.stroke}
                key={line.dataKey}
                visible={visible}
                x={x}
                y={tooltipData?.yPositions[line.dataKey] ?? 0}
              />
            ))}
          </g>
        </svg>
      )}

      <TooltipBox
        containerHeight={height}
        containerRef={containerRef}
        containerWidth={width}
        visible={visible}
        x={xWithMargin}
        y={margin.top}
      >
        <TooltipContent rows={tooltipRows} title={title} />
      </TooltipBox>

      {showDatePill && dateLabels.length > 0 && visible && (
        <motion.div
          className="pointer-events-none absolute z-50"
          style={{ left: animatedX, transform: "translateX(-50%)", bottom: 4 }}
        >
          <DateTicker
            currentIndex={tooltipData?.index ?? 0}
            labels={dateLabels}
            visible={visible}
          />
        </motion.div>
      )}
    </>,
    container,
  );
}

/* ─── Grid ───────────────────────────────────────────────────────────── */

export function Grid({
  numTicksRows = 5,
  strokeDasharray = "4,4",
}: {
  numTicksRows?: number;
  strokeDasharray?: string;
}) {
  const { yScale, innerWidth, innerHeight } = useChart();
  const uniqueId = useId();
  const maskId = `grid-rows-fade-${uniqueId}`;
  const gradientId = `${maskId}-gradient`;

  return (
    <g className="chart-grid">
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" style={{ stopColor: "white", stopOpacity: 0 }} />
          <stop offset="10%" style={{ stopColor: "white", stopOpacity: 1 }} />
          <stop offset="90%" style={{ stopColor: "white", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "white", stopOpacity: 0 }} />
        </linearGradient>
        <mask id={maskId}>
          <rect fill={`url(#${gradientId})`} height={innerHeight} width={innerWidth} x="0" y="0" />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <GridRows
          numTicks={numTicksRows}
          scale={yScale}
          stroke={chartCssVars.grid}
          strokeDasharray={strokeDasharray}
          width={innerWidth}
        />
      </g>
    </g>
  );
}

/* ─── XAxis / YAxis ──────────────────────────────────────────────────── */

function XAxisLabel({
  label,
  x,
  crosshairX,
  isHovering,
  tickerHalfWidth,
}: {
  label: string;
  x: number;
  crosshairX: number | null;
  isHovering: boolean;
  tickerHalfWidth: number;
}) {
  const fadeBuffer = 20;
  const fadeRadius = tickerHalfWidth + fadeBuffer;

  let opacity = 1;
  if (isHovering && crosshairX !== null) {
    const distance = Math.abs(x - crosshairX);
    if (distance < tickerHalfWidth) opacity = 0;
    else if (distance < fadeRadius) opacity = (distance - tickerHalfWidth) / fadeBuffer;
  }

  return (
    <div
      className="absolute"
      style={{ left: x, bottom: 12, width: 0, display: "flex", justifyContent: "center" }}
    >
      <motion.span
        animate={{ opacity }}
        className="text-[11px] whitespace-nowrap text-ink-muted"
        initial={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        {label}
      </motion.span>
    </div>
  );
}

export function XAxis({
  numTicks = 5,
  tickerHalfWidth = 50,
}: {
  numTicks?: number;
  tickerHalfWidth?: number;
}) {
  const { xScale, margin, tooltipData, containerRef } = useChart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const labelsToShow = useMemo(() => {
    const [startDate, endDate] = xScale.domain();
    if (!(startDate && endDate)) return [];
    const startTime = startDate.getTime();
    const timeRange = endDate.getTime() - startTime;
    const tickCount = Math.max(2, numTicks);

    return Array.from({ length: tickCount }, (_, i) => {
      const date = new Date(startTime + (i / (tickCount - 1)) * timeRange);
      return {
        x: (xScale(date) ?? 0) + margin.left,
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });
  }, [xScale, margin.left, numTicks]);

  const isHovering = tooltipData !== null;
  const crosshairX = tooltipData ? tooltipData.x + margin.left : null;

  const container = containerRef.current;
  if (!(mounted && container)) return null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {labelsToShow.map((item) => (
        <XAxisLabel
          crosshairX={crosshairX}
          isHovering={isHovering}
          key={`${item.label}-${item.x}`}
          label={item.label}
          tickerHalfWidth={tickerHalfWidth}
          x={item.x}
        />
      ))}
    </div>,
    container,
  );
}

export function YAxis({
  numTicks = 5,
  formatValue,
}: {
  numTicks?: number;
  formatValue?: (value: number) => string;
}) {
  const { yScale, margin, containerRef } = useChart();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setContainer(containerRef.current);
  }, [containerRef]);

  const ticks = useMemo(() => {
    const [min, max] = yScale.domain() as [number, number];
    const step = (max - min) / (numTicks - 1);
    return Array.from({ length: numTicks }, (_, i) => {
      const value = min + step * i;
      return {
        value,
        y: (yScale(value) ?? 0) + margin.top,
        label: formatValue
          ? formatValue(value)
          : Math.abs(value) >= 1000
            ? `${(value / 1000).toFixed(Math.abs(value) % 1000 === 0 ? 0 : 1)}k`
            : value.toLocaleString(),
      };
    });
  }, [yScale, margin.top, numTicks, formatValue]);

  if (!container) return null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <div
          key={tick.value}
          className="absolute"
          style={{
            left: 0,
            top: tick.y,
            width: margin.left - 8,
            display: "flex",
            justifyContent: "flex-end",
            transform: "translateY(-50%)",
          }}
        >
          <span className="text-[11px] whitespace-nowrap tnum text-ink-muted">{tick.label}</span>
        </div>
      ))}
    </div>,
    container,
  );
}

/* ─── Area ───────────────────────────────────────────────────────────── */

export interface AreaProps {
  dataKey: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  curve?: CurveFactory;
  animate?: boolean;
  showLine?: boolean;
  showHighlight?: boolean;
  gradientToOpacity?: number;
  fadeEdges?: boolean;
}

export function Area({
  dataKey,
  fill = chartCssVars.linePrimary,
  fillOpacity = 0.4,
  stroke,
  strokeWidth = 2,
  curve = curveMonotoneX,
  animate = true,
  showLine = true,
  showHighlight = true,
  gradientToOpacity = 0,
  fadeEdges = false,
}: AreaProps) {
  const {
    data,
    xScale,
    yScale,
    innerHeight,
    innerWidth,
    tooltipData,
    isLoaded,
    animationDuration,
    xAccessor,
  } = useChart();

  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [clipWidth, setClipWidth] = useState(0);

  const uniqueId = useId();
  const gradientId = `area-gradient-${dataKey}-${uniqueId}`;
  const strokeGradientId = `area-stroke-gradient-${dataKey}-${uniqueId}`;
  const edgeMaskId = `area-edge-mask-${dataKey}-${uniqueId}`;
  const edgeGradientId = `${edgeMaskId}-gradient`;

  const resolvedStroke = stroke || fill;

  useEffect(() => {
    if (pathRef.current && animate) {
      const len = pathRef.current.getTotalLength();
      if (len > 0) {
        setPathLength(len);
        if (!isLoaded) requestAnimationFrame(() => setClipWidth(innerWidth));
      }
    }
  }, [animate, innerWidth, isLoaded]);

  const findLengthAtX = useCallback(
    (targetX: number): number => {
      const path = pathRef.current;
      if (!path || pathLength === 0) return 0;
      let low = 0;
      let high = pathLength;
      while (high - low > 0.5) {
        const mid = (low + high) / 2;
        if (path.getPointAtLength(mid).x < targetX) low = mid;
        else high = mid;
      }
      return (low + high) / 2;
    },
    [pathLength],
  );

  const segmentBounds = useMemo(() => {
    if (!pathRef.current || pathLength === 0 || !tooltipData)
      return { startLength: 0, segmentLength: 0 };
    const idx = tooltipData.index;
    const startPoint = data[Math.max(0, idx - 1)];
    const endPoint = data[Math.min(data.length - 1, idx + 1)];
    if (!(startPoint && endPoint)) return { startLength: 0, segmentLength: 0 };
    const startLength = findLengthAtX(xScale(xAccessor(startPoint)) ?? 0);
    const endLength = findLengthAtX(xScale(xAccessor(endPoint)) ?? 0);
    return { startLength, segmentLength: endLength - startLength };
  }, [tooltipData, data, xScale, pathLength, xAccessor, findLengthAtX]);

  const springConfig = { stiffness: 180, damping: 28 };
  const offsetSpring = useSpring(0, springConfig);
  const segmentLengthSpring = useSpring(0, springConfig);
  const animatedDasharray = useMotionTemplate`${segmentLengthSpring} ${pathLength}`;

  useEffect(() => {
    offsetSpring.set(-segmentBounds.startLength);
    segmentLengthSpring.set(segmentBounds.segmentLength);
  }, [segmentBounds.startLength, segmentBounds.segmentLength, offsetSpring, segmentLengthSpring]);

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      return typeof value === "number" ? (yScale(value) ?? 0) : 0;
    },
    [dataKey, yScale],
  );

  const isHovering = tooltipData !== null;
  const easing = "cubic-bezier(0.85, 0, 0.15, 1)";

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: fill, stopOpacity: fillOpacity }} />
          <stop offset="100%" style={{ stopColor: fill, stopOpacity: gradientToOpacity }} />
        </linearGradient>

        <linearGradient id={strokeGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" style={{ stopColor: resolvedStroke, stopOpacity: 0 }} />
          <stop offset="15%" style={{ stopColor: resolvedStroke, stopOpacity: 1 }} />
          <stop offset="85%" style={{ stopColor: resolvedStroke, stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: resolvedStroke, stopOpacity: 0 }} />
        </linearGradient>

        {fadeEdges && (
          <>
            <linearGradient id={edgeGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" style={{ stopColor: "white", stopOpacity: 0 }} />
              <stop offset="20%" style={{ stopColor: "white", stopOpacity: 1 }} />
              <stop offset="80%" style={{ stopColor: "white", stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: "white", stopOpacity: 0 }} />
            </linearGradient>
            <mask id={edgeMaskId}>
              <rect
                fill={`url(#${edgeGradientId})`}
                height={innerHeight}
                width={innerWidth}
                x="0"
                y="0"
              />
            </mask>
          </>
        )}
      </defs>

      {animate && (
        <defs>
          <clipPath id={`grow-clip-area-${dataKey}-${uniqueId}`}>
            <rect
              height={innerHeight + 20}
              style={{
                transition:
                  !isLoaded && clipWidth > 0 ? `width ${animationDuration}ms ${easing}` : "none",
              }}
              width={isLoaded ? innerWidth : clipWidth}
              x={0}
              y={0}
            />
          </clipPath>
        </defs>
      )}

      <g clipPath={animate ? `url(#grow-clip-area-${dataKey}-${uniqueId})` : undefined}>
        <motion.g
          animate={{ opacity: isHovering && showHighlight ? 0.6 : 1 }}
          initial={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <g mask={fadeEdges ? `url(#${edgeMaskId})` : undefined}>
            <AreaClosed
              curve={curve}
              data={data}
              fill={`url(#${gradientId})`}
              x={(d) => xScale(xAccessor(d)) ?? 0}
              y={getY}
              yScale={yScale}
            />
          </g>

          {showLine && (
            <LinePath
              curve={curve}
              data={data}
              innerRef={pathRef}
              stroke={`url(#${strokeGradientId})`}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
              x={(d) => xScale(xAccessor(d)) ?? 0}
              y={getY}
            />
          )}
        </motion.g>
      </g>

      {showHighlight && showLine && isHovering && isLoaded && pathRef.current && (
        <motion.path
          animate={{ opacity: 1 }}
          d={pathRef.current.getAttribute("d") || ""}
          exit={{ opacity: 0 }}
          fill="none"
          initial={{ opacity: 0 }}
          stroke={resolvedStroke}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          style={{ strokeDasharray: animatedDasharray, strokeDashoffset: offsetSpring }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      )}
    </>
  );
}

/* ─── AreaChart shell ────────────────────────────────────────────────── */

function extractAreaConfigs(children: ReactNode): LineConfig[] {
  const configs: LineConfig[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as AreaProps | undefined;
    if (props && typeof props.dataKey === "string" && props.dataKey.length > 0) {
      configs.push({
        dataKey: props.dataKey,
        stroke: props.stroke || props.fill || chartCssVars.linePrimary,
        strokeWidth: props.strokeWidth || 2,
      });
    }
  });
  return configs;
}

export interface AreaChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  margin?: Partial<Margin>;
  animationDuration?: number;
  aspectRatio?: string;
  /** Fixed pixel height — wins over aspectRatio when set. */
  height?: number;
  /** Extra headroom multiplier applied to the y-domain padding. */
  yPaddingRatio?: number;
  className?: string;
  children: ReactNode;
}

const DEFAULT_MARGIN: Margin = { top: 24, right: 24, bottom: 44, left: 56 };

function ChartInner({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  yPaddingRatio,
  children,
  containerRef,
}: {
  width: number;
  height: number;
  data: Record<string, unknown>[];
  xDataKey: string;
  margin: Margin;
  animationDuration: number;
  yPaddingRatio: number;
  children: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  const lines = useMemo(() => extractAreaConfigs(children), [children]);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xAccessor = useCallback(
    (d: Record<string, unknown>): Date => {
      const value = d[xDataKey];
      return value instanceof Date ? value : new Date(value as string | number);
    },
    [xDataKey],
  );

  const bisectDate = useMemo(
    () => bisector<Record<string, unknown>, Date>((d) => xAccessor(d)).left,
    [xAccessor],
  );

  const xScale = useMemo(() => {
    const dates = data.map((d) => xAccessor(d));
    return scaleTime({
      range: [0, innerWidth],
      domain: [
        Math.min(...dates.map((d) => d.getTime())),
        Math.max(...dates.map((d) => d.getTime())),
      ],
    });
  }, [innerWidth, data, xAccessor]);

  const columnWidth = useMemo(
    () => (data.length < 2 ? 0 : innerWidth / (data.length - 1)),
    [innerWidth, data.length],
  );

  // Financial series: span min→max with padding, never anchored to zero.
  const yScale = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const line of lines) {
      for (const d of data) {
        const value = d[line.dataKey];
        if (typeof value === "number") {
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 100;
    }
    const pad = (max - min || Math.abs(max) || 1) * 0.08 * yPaddingRatio;
    return scaleLinear({ range: [innerHeight, 0], domain: [min - pad, max + pad] });
  }, [innerHeight, data, lines, yPaddingRatio]);

  const dateLabels = useMemo(
    () =>
      data.map((d) =>
        xAccessor(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      ),
    [data, xAccessor],
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), animationDuration);
    return () => clearTimeout(timer);
  }, [animationDuration]);

  const { tooltipData, setTooltipData, interactionHandlers, interactionStyle } =
    useChartInteraction({
      xScale,
      yScale,
      data,
      lines,
      margin,
      xAccessor,
      bisectDate,
      canInteract: isLoaded,
    });

  if (width < 10 || height < 10) return null;

  const contextValue: ChartContextValue = {
    data,
    xScale,
    yScale,
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    columnWidth,
    tooltipData,
    setTooltipData,
    containerRef,
    lines,
    isLoaded,
    animationDuration,
    xAccessor,
    dateLabels,
  };

  return (
    <ChartContext.Provider value={contextValue}>
      <svg aria-hidden="true" height={height} width={width}>
        <rect fill="transparent" height={height} width={width} x={0} y={0} />
        <g
          {...interactionHandlers}
          style={interactionStyle}
          transform={`translate(${margin.left},${margin.top})`}
        >
          <rect fill="transparent" height={innerHeight} width={innerWidth} x={0} y={0} />
          {children}
        </g>
      </svg>
    </ChartContext.Provider>
  );
}

/**
 * Container measurement. The source used @visx ParentSize, which waits for a
 * ResizeObserver delivery before the first real render; this measures
 * synchronously after layout (so the chart paints on mount even where RO
 * delivery is delayed) and keeps RO + window-resize for updates.
 */
function useElementSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width !== r.width || prev.height !== r.height
          ? { width: r.width, height: r.height }
          : prev,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);

  return size;
}

export function AreaChart({
  data,
  xDataKey = "date",
  margin: marginProp,
  animationDuration = 1100,
  aspectRatio = "2 / 1",
  height,
  yPaddingRatio = 1,
  className = "",
  children,
}: AreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const margin = { ...DEFAULT_MARGIN, ...marginProp };
  const { width, height: measuredHeight } = useElementSize(containerRef);

  return (
    <div
      className={cn("relative w-full", className)}
      ref={containerRef}
      style={height ? { height, touchAction: "none" } : { aspectRatio, touchAction: "none" }}
    >
      <ChartInner
        animationDuration={animationDuration}
        containerRef={containerRef}
        data={data}
        height={measuredHeight}
        margin={margin}
        width={width}
        xDataKey={xDataKey}
        yPaddingRatio={yPaddingRatio}
      >
        {children}
      </ChartInner>
    </div>
  );
}
