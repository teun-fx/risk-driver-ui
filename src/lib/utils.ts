import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge doesn't know this project's custom type-scale utilities and
 * its catch-all classifies any unknown `text-*` as a COLOR — so
 * cn("text-title text-ink") silently dropped `text-title` as a "conflicting
 * color". Registering them in the font-size group makes them conflict with
 * each other (correct) and coexist with colors (correct).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-display",
        "text-metric",
        "text-title",
        "text-body",
        "text-label",
        "text-eyebrow",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Money, always signed when it represents a change. */
export function money(v: number, opts: { signed?: boolean } = {}) {
  const s = Math.abs(v).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  if (!opts.signed) return v < 0 ? `-${s}` : s;
  return `${v < 0 ? "−" : "+"}${s}`;
}

/**
 * Instrument price. Keeps the precision the instrument actually quotes at —
 * the default toLocaleString caps at 3 decimals, which silently truncates
 * FX pairs (1.0842 -> "1.084").
 */
export function price(v: number) {
  const decimals = Math.abs(v) < 10 ? 4 : 2;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function pct(v: number, opts: { signed?: boolean } = {}) {
  const s = `${Math.abs(v).toFixed(2)}%`;
  if (!opts.signed) return v < 0 ? `-${s}` : s;
  return `${v < 0 ? "−" : "+"}${s}`;
}
