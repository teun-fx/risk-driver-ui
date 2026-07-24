import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
