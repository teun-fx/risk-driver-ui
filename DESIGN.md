# Risk Driver — Design System

A dark fintech system for serious traders. Calm, dense, data-first.
Mercury-level restraint translated to a charcoal theme.

Source of truth: `src/app/globals.css`. Never hard-code a hex in a component.

## Principles

1. **Chrome recedes, data advances.** Borders are hairlines, grids are barely
   visible, scrollbars are muted. Nothing competes with the numbers.
2. **One accent.** Muted teal marks focus, active nav, and the primary series.
   If everything is accented, nothing is.
3. **Color is never the only signal.** Every P&L value carries an arrow glyph
   and an explicit `+`/`−`. Every status badge carries a dot plus a text label.
4. **Figures align.** All numeric columns use `tnum` (tabular figures). A
   column of misaligned digits is unreadable at a glance.

## Tokens

### Surfaces — a four-step ladder, never pure black

| Token | Value | Use |
|---|---|---|
| `base` | `#0d1012` | Page background |
| `surface` | `#14181b` | Cards, sidebar |
| `raised` | `#191e22` | Table headers, inputs, nested panels |
| `overlay` | `#1f252a` | Tooltips, menus, hover fills |

### Borders — three roles

`line` `#232a2f` default hairline · `line-strong` `#2f383e` hover/focus edge ·
`grid` the recessive rule inside data surfaces (chart gridlines, monthly-returns
cells). `grid` aliases `--color-chart-grid` from `:root`, so the chart's SVG
grid and the table's borders cannot drift apart.

### Ink

`ink` `#e6eaec` primary · `ink-secondary` `#97a3ab` labels and axes ·
`ink-muted` `#626d75` meta and disabled

### Accent

`accent` `#2f9e8b` · `accent-hover` `#37b39d` · `accent-press` `#278275` ·
`accent-soft` `#14312e` tinted fill · `on-accent` `#04120f` text on accent

### Semantic P&L

`profit` `#45a67c` · `loss` `#c26b6d` · `warn` `#b8934e`, each with a `-soft`
tinted background.

> **Accessibility constraint.** The profit/loss pair measures **ΔE 2.4 under
> deuteranopia** — effectively identical for red-green colorblind readers
> (~8% of men). This is inherent to the green/red trading convention, not a
> tuning problem. It is mitigated by *always* pairing the color with a shape
> cue: an arrow glyph and an explicit sign. **Never ship a P&L value styled by
> color alone.** If you later want a colorblind-safe scheme, teal/amber is the
> conventional swap.

### Chart ramp — fixed order, never cycled

`chart-1` `#2f9e8b` · `chart-2` `#7b7fd4` · `chart-3` `#ab7a33` ·
`chart-4` `#b5679a` · `chart-grid` `#1e2429`

Validated against surface `#14181b` — lightness band, chroma floor, CVD
separation, normal-vision floor and contrast all pass. **Re-run the palette
validator before changing any value.** A 5th series is not a new hue: fold it
into "Other", facet it, or use small multiples.

### ⚠️ The `@theme` tree-shaking trap — read before adding any colour token

Tailwind v4 only emits an `@theme` variable if it sees the *literal* utility
name in source. A token referenced **only** through `var()` in an inline style —
especially one built dynamically, like `var(--color-chart-${i})` or
`` `var(--color-${tone}-glow)` `` — gets tree-shaken and resolves to nothing at
runtime. `tsc`, ESLint and `next build` all pass. The failure is silent and
purely visual.

**This has bitten three times:**

1. `--color-chart-3/4` → the allocation bar rendered 2 of 4 segments.
2. `border-chart-grid` → a utility that never existed, so no border drew.
3. `--color-profit-glow` / `--color-loss-glow` → one empty stop invalidated the
   entire gradient, so every analytics bar rendered transparent.

**Rule:** if a token is only ever read via `var()` (chart ramp, inline
gradients, Recharts props), declare it in `:root`. Put it in `@theme` only if
you also use it as a real utility class (`bg-profit`, `border-grid`). After
adding one, verify in the browser:

```js
getComputedStyle(document.documentElement).getPropertyValue("--color-x");
```

### Radius, shadow, motion

`xs` 3px · `sm` 5px · `md` 7px · `lg` 10px — 10px is the ceiling; nothing is
pill-shaped except meters and dots.

One shadow, `shadow-pop`, reserved for genuinely floating layers (tooltips,
menus). Cards get borders, not shadows.

Transitions are 150ms (controls) or 200ms (surfaces), `ease-out`. Colors and
opacity only — no transforms, no entrance animations. `prefers-reduced-motion`
is honored globally.

### Type

Inter, one family. Tight negative tracking at large sizes is the premium tell.

`text-display` 30px · `text-metric` 25px tabular · `text-title` 15px ·
`text-body` 13.5px · `text-label` 12px · `text-eyebrow` 10.5px uppercase ·
`tnum` tabular figures

## Components

`src/components/ui/` — Card, Button (primary/secondary/ghost × sm/md),
IconButton, Badge (5 tones, optional dot), Progress, SegmentMeter, Table
primitives, Input, SearchInput, SegmentedControl.

`src/components/dashboard/` — Sidebar, Header, AccountSelect, KpiCard,
EquityChart, RiskPanel, StatsGrid, MonthlyReturns, TradedPairs, TradesFeed.

### Account scoping

`AccountSelect` in the header is the control that scopes the whole page. State
lives in `Dashboard` (`dashboard.tsx`) and every section takes `account` as a
prop — KPIs, equity curve, risk, statistics, pairs, trades and monthly returns
all re-derive from it. Adding a section means threading `account` through, not
reading a module-level constant.

Below `md` the selector moves to its own row under the header rather than being
hidden. It scopes the entire page, so it must never be the thing that drops.

### Monthly returns

Years as rows (newest first), Jan–Dec as columns, compounded annual total on
the right. The range is derived from `account.since` through the current year —
an account live since 2020 renders 2020–2026 automatically, with no config.

**It is styled as a sibling of the equity chart, not as a heatmap widget.** It
borrows the chart card's anatomy deliberately: headline metric with a caption,
a legend row beneath the header, axis-style 11px `ink-muted` column labels, and
recessive `border-grid` hairlines instead of chunky filled blocks. Cell fills
sit in the same 3–18% opacity band as the chart's area gradient. If you touch
one of the two cards, check it still matches the other.

Hues stay semantic — profit green, loss red, never the chart's teal/indigo,
which carry no directional meaning to a trader. The scale is normalized to
*that account's* own largest absolute month, so a calm account doesn't render
as a flat grey grid.

Two cases must stay distinct: a month that has not happened yet, or predates
the account, is `null` and renders as a muted `·` with an `sr-only` "No data" —
never as `0.0`. A real 0% month is a genuine data point.

## States

Every interactive element defines all five: rest, hover (border or background
lift, never a transform), active (one step darker), focus-visible (2px accent
ring, offset 2px), disabled (40% opacity, pointer-events none).

Pointer focus never rings — only `:focus-visible` does.

## Layout

Sidebar is a fixed 64px icon rail with hover tooltips, hidden below `sm`.
Content max-width 1440px, 24–32px page padding, 20px gutter between cards.
Grid is 3-column at `xl`, stacking below.

Wide content (the monthly-returns grid) scrolls inside its own
`overflow-x-auto` container, with the year column sticky at the left edge.
**The page body must never scroll horizontally** — verify with
`document.documentElement.scrollWidth === clientWidth` at 375px. Recharts
containers need `min-w-0` on every flex/grid ancestor or they refuse to shrink.

## Placeholder data

All content in `src/lib/data.ts` is placeholder. The equity series is
seeded-deterministic so server and client render identically — do not swap in
`Math.random()` or you will get hydration errors.
