"use client";

import { useState } from "react";

/**
 * The Monte Carlo chart's readout anatomy, shared so every analytical chart
 * reads the same way: no floating tooltip card, a dashed crosshair on the
 * plot, and a bordered row of labelled figures underneath that updates as the
 * pointer moves. Values fall back to the latest point when nothing is hovered,
 * so the row is never empty.
 */
export function ChartReadout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line px-1 pt-3 sm:grid-cols-3 lg:grid-cols-6">
      {children}
    </div>
  );
}

export function Read({
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

/** The dashed crosshair the Monte Carlo plot draws on hover. */
export const CROSSHAIR = {
  stroke: "var(--color-line-strong)",
  strokeWidth: 1,
  strokeDasharray: "3 3",
} as const;

/**
 * Tracks the hovered category index from the pointer's position over the plot
 * area, the way the Monte Carlo canvas does it. Recharts 3's own tooltip
 * activation does not fire reliably with a null-rendering tooltip, and
 * deriving the index from geometry keeps every chart on one behaviour.
 *
 * `padLeft` is the chart's left margin plus its Y-axis width; `padRight` is
 * the right margin.
 */
export function usePlotHover({
  count,
  padLeft,
  padRight,
}: {
  count: number;
  padLeft: number;
  padRight: number;
}) {
  const [index, setIndex] = useState<number | null>(null);

  const handlers = {
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const span = r.width - padLeft - padRight;
      if (span <= 0 || count < 2) return;
      const rel = (e.clientX - r.left - padLeft) / span;
      const i = Math.round(rel * (count - 1));
      setIndex(i >= 0 && i < count ? i : null);
    },
    onMouseLeave: () => setIndex(null),
  };

  return { index, handlers };
}
