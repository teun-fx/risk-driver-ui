import { Card } from "@/components/ui/card";
import { returnStatistics, type Account } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * The full statistics block — a quiet, dense grid in the factsheet idiom:
 * eyebrow section title, then compact label-over-value cells, five to a row.
 * Directional figures (wins, losses, drawdown) carry a semantic tint;
 * everything else stays neutral ink so the colour means something.
 *
 * Each value explains itself on hover: a small note tooltip, pure CSS
 * (group-hover) so the card stays a server component, and reachable by
 * keyboard focus too.
 */
export function ReturnStatistics({ account }: { account: Account }) {
  const stats = returnStatistics(account);

  return (
    <Card className="px-5 py-4 sm:px-6 sm:py-5">
      <p className="text-eyebrow text-ink-muted">Return statistics</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[11.5px] text-ink-muted">{s.label}</dt>
            <dd
              tabIndex={0}
              className="group relative mt-0.5 inline-block cursor-help rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span
                className={cn(
                  "text-[17px] leading-6 font-semibold tnum tracking-[-0.01em]",
                  s.tone === "profit"
                    ? "text-profit"
                    : s.tone === "loss"
                      ? "text-loss"
                      : "text-ink",
                )}
              >
                {s.value}
              </span>

              {/* Definition tooltip — the same panel as the chart tooltips:
                  hairline border, overlay surface, pop shadow. */}
              <span
                role="tooltip"
                className={cn(
                  "pointer-events-none invisible absolute bottom-[calc(100%+7px)] left-0 z-30 w-52",
                  "rounded-md border border-line bg-overlay px-3 py-2.5 shadow-pop",
                  // text-[12px], not text-label: tailwind-merge (via cn) doesn't
                  // know the custom text-label utility and drops it as a
                  // conflict with text-ink-secondary. An arbitrary size survives.
                  "text-[12px] leading-snug font-normal text-ink-secondary",
                  "opacity-0 transition-opacity duration-150 ease-out",
                  "group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100",
                )}
              >
                {s.note}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
