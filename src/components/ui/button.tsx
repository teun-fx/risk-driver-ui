import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

/**
 * The liquid-glass chrome for primary actions: layered inset highlights over
 * a backdrop-distortion filter, near-white ink. The filter is defined once in
 * GlassFilter below and shared by id across every instance on the page.
 */
const glassShadow =
  "shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)]";

const variants: Record<Variant, string> = {
  primary: "text-ink hover:brightness-110 active:brightness-90",
  secondary:
    "border border-line bg-raised text-ink hover:border-line-strong hover:bg-overlay active:bg-raised",
  ghost:
    "text-ink-secondary hover:bg-overlay hover:text-ink active:bg-raised",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-label",
  md: "h-9 gap-2 px-3.5 text-label",
};

function GlassLayers() {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-md",
          glassShadow,
        )}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-md"
        style={{ backdropFilter: 'url("#liquid-glass")' }}
      />
    </>
  );
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  children,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  const glass = variant === "primary";
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap",
        "transition-[color,background-color,border-color,filter] duration-150 ease-out",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        glass && "relative isolate",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {glass && <GlassLayers />}
      {glass ? <span className="z-10 inline-flex items-center gap-2">{children}</span> : children}
    </button>
  );
}

/** Square icon-only button. Always pass an aria-label. */
export function IconButton({
  className,
  variant = "ghost",
  children,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant }) {
  const glass = variant === "primary";
  return (
    <button
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
        "transition-[color,background-color,border-color,filter] duration-150 ease-out",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-[17px] [&_svg]:shrink-0",
        glass && "relative isolate",
        variants[variant],
        className,
      )}
      {...props}
    >
      {glass && <GlassLayers />}
      {glass ? <span className="z-10 inline-flex">{children}</span> : children}
    </button>
  );
}

/**
 * The shared displacement filter behind every glass button. Rendered once in
 * the app shell; duplicate renders are harmless (first id wins).
 */
export function GlassFilter() {
  return (
    <svg className="hidden" aria-hidden>
      <defs>
        <filter
          id="liquid-glass"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves="1"
            seed="1"
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale="40"
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="3" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
