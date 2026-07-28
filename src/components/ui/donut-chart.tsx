"use client";

/**
 * Vendored port of the reference DonutChart: rounded animated segments that
 * draw in on mount, hover glow + scale, and free-form center content. Two
 * adaptations: `framer-motion` → the app's `motion/react`, and the base ring
 * reads the app's raised token instead of the source's hsl(--border).
 * `activeLabel` was added so an external legend can drive the highlight.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

export interface DonutChartSegment {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: DonutChartSegment[];
  totalValue?: number;
  size?: number;
  strokeWidth?: number;
  animationDuration?: number;
  animationDelayPerSegment?: number;
  highlightOnHover?: boolean;
  centerContent?: React.ReactNode;
  /** Externally-driven highlight (e.g. from a legend row). */
  activeLabel?: string | null;
  /** Callback when a segment is hovered. */
  onSegmentHover?: (segment: DonutChartSegment | null) => void;
}

const DonutChart = React.forwardRef<HTMLDivElement, DonutChartProps>(
  (
    {
      data,
      totalValue: propTotalValue,
      size = 200,
      strokeWidth = 20,
      animationDuration = 1,
      animationDelayPerSegment = 0.05,
      highlightOnHover = true,
      centerContent,
      activeLabel = null,
      onSegmentHover,
      className,
      ...props
    },
    ref,
  ) => {
    const [hoveredSegment, setHoveredSegment] =
      React.useState<DonutChartSegment | null>(null);

    const internalTotalValue = React.useMemo(
      () =>
        propTotalValue || data.reduce((sum, segment) => sum + segment.value, 0),
      [data, propTotalValue],
    );

    const radius = size / 2 - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    let cumulativePercentage = 0;

    React.useEffect(() => {
      onSegmentHover?.(hoveredSegment);
    }, [hoveredSegment, onSegmentHover]);

    const handleMouseLeave = () => {
      setHoveredSegment(null);
    };

    return (
      <div
        ref={ref}
        className={cn("relative flex items-center justify-center", className)}
        style={{ width: size, height: size }}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 overflow-visible"
        >
          {/* Base background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="var(--color-raised)"
            strokeWidth={strokeWidth}
          />

          {/* Data segments */}
          <AnimatePresence>
            {data.map((segment, index) => {
              if (segment.value === 0) return null;

              const percentage =
                internalTotalValue === 0
                  ? 0
                  : (segment.value / internalTotalValue) * 100;

              const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
              const strokeDashoffset =
                (cumulativePercentage / 100) * circumference;

              const isActive =
                hoveredSegment?.label === segment.label ||
                activeLabel === segment.label;

              cumulativePercentage += percentage;

              return (
                <motion.circle
                  key={segment.label || index}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={-strokeDashoffset}
                  strokeLinecap="round"
                  initial={{ opacity: 0, strokeDashoffset: circumference }}
                  animate={{
                    opacity: 1,
                    strokeDashoffset: -strokeDashoffset,
                  }}
                  transition={{
                    opacity: {
                      duration: 0.3,
                      delay: index * animationDelayPerSegment,
                    },
                    strokeDashoffset: {
                      duration: animationDuration,
                      delay: index * animationDelayPerSegment,
                      ease: "easeOut",
                    },
                  }}
                  className={cn(
                    "origin-center",
                    highlightOnHover && "cursor-pointer",
                  )}
                  style={{
                    filter: isActive
                      ? `drop-shadow(0px 0px 6px ${segment.color}) brightness(1.1)`
                      : "none",
                    transform: isActive ? "scale(1.03)" : "scale(1)",
                    transition:
                      "filter 0.2s ease-out, transform 0.2s ease-out",
                  }}
                  onMouseEnter={() => setHoveredSegment(segment)}
                />
              );
            })}
          </AnimatePresence>
        </svg>

        {/* Center content */}
        {centerContent && (
          <div
            className="pointer-events-none absolute flex flex-col items-center justify-center"
            style={{
              width: size - strokeWidth * 2.5,
              height: size - strokeWidth * 2.5,
            }}
          >
            {centerContent}
          </div>
        )}
      </div>
    );
  },
);

DonutChart.displayName = "DonutChart";

export { DonutChart };
