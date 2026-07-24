"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tradeOutcomes, type Account } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Outcome donut + the three ratios a trader actually judges an edge by.
 * The donut is hand-rolled SVG in the reference's style — thick ring, rounded
 * segment ends, visible gaps — on the app's own semantic tokens: win = profit,
 * loss = loss, break-even = neutral ink. Identity is never colour-alone; the
 * legend names every slice with its count and share.
 */

const R = 62;
const C = 2 * Math.PI * R;
const STROKE = 15;
/** Gap between segments along the circumference, in px. Round caps extend
    half the stroke width past each dash end, so the visible gap is roughly
    GAP − STROKE. */
const GAP = 21;

type Slice = {
  label: string;
  /** What the center reads when this slice is hovered, e.g. "Win rate". */
  rate: string;
  pct: number;
  count: number;
  color: string;
};

function Donut({
  slices,
  hovered,
  onHover,
}: {
  slices: Slice[];
  hovered: number | null;
  onHover: (i: number | null) => void;
}) {
  // Precompute each slice's start angle — no mutation during render.
  const drawn = slices
    .filter((s) => s.pct > 0)
    .reduce<Array<Slice & { start: number; index: number }>>((out, s) => {
      const prev = out[out.length - 1];
      out.push({
        ...s,
        start: prev ? prev.start + prev.pct : 0,
        index: slices.indexOf(s),
      });
      return out;
    }, []);

  // Center reflects the hovered slice, or the win rate at rest.
  const active = hovered != null ? slices[hovered] : null;

  return (
    <div className="relative size-[208px]">
      <svg viewBox="0 0 160 160" className="size-full -rotate-90">
        {drawn.map((s) => {
          const arc = (s.pct / 100) * C;
          const dash = Math.max(2, arc - GAP);
          const rotation = (s.start / 100) * 360;
          const dimmed = hovered != null && hovered !== s.index;
          return (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C - dash}`}
              transform={`rotate(${rotation} 80 80)`}
              className="cursor-pointer transition-opacity duration-150 ease-out"
              style={{ opacity: dimmed ? 0.28 : 1 }}
              onMouseEnter={() => onHover(s.index)}
              onMouseLeave={() => onHover(null)}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-metric text-ink">
          {active ? active.pct : slices[0].pct}%
        </span>
        <span className="mt-0.5 text-label text-ink-muted">
          {active ? active.rate : "Win rate"}
        </span>
        {active && (
          <span className="mt-1 text-[11.5px] tnum text-ink-secondary">
            {active.count.toLocaleString("en-US")} trades
          </span>
        )}
      </div>
    </div>
  );
}

export function TradeOutcomes({ account }: { account: Account }) {
  const o = tradeOutcomes(account);
  const [hovered, setHovered] = useState<number | null>(null);

  const slices: Slice[] = [
    {
      label: "Wins",
      rate: "Win rate",
      pct: o.winPct,
      count: o.wins,
      color: "var(--color-profit)",
    },
    {
      label: "Break-even",
      rate: "Break-even rate",
      pct: o.breakEvenPct,
      count: o.breakEven,
      color: "var(--color-ink-muted)",
    },
    {
      label: "Losses",
      rate: "Loss rate",
      pct: o.lossPct,
      count: o.losses,
      color: "var(--color-loss)",
    },
  ];

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader>
        <CardTitle>Trade outcomes</CardTitle>
        <span className="text-label text-ink-muted">
          {o.total.toLocaleString("en-US")} trades
        </span>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        {/* Donut takes the freed space so the card stands level with the
            underwater plot beside it. */}
        <div
          className="flex flex-1 items-center justify-center py-2"
          role="img"
          aria-label={`Of ${o.total} trades: ${o.winPct} percent wins, ${o.breakEvenPct} percent break-even, ${o.lossPct} percent losses`}
        >
          <Donut slices={slices} hovered={hovered} onHover={setHovered} />
        </div>

        {/* Legend — identity carried by label + count, never colour alone.
            Hovering a row highlights the matching donut segment and vice versa. */}
        <dl className="mt-2 space-y-1">
          {slices.map((s, i) => (
            <div
              key={s.label}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1 transition-colors duration-150 ease-out",
                hovered === i ? "bg-raised" : "hover:bg-raised/60",
              )}
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: s.color }}
                aria-hidden
              />
              <dt className="text-label text-ink-secondary">{s.label}</dt>
              <dd className="ml-auto text-label tnum text-ink-muted">
                {s.count.toLocaleString("en-US")} trades
              </dd>
              <dd className="w-10 text-right text-label tnum font-medium text-ink">
                {s.pct}%
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
