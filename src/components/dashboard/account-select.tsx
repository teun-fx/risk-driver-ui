"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Wallet } from "lucide-react";
import { type Account } from "@/lib/data";
import { useAccount } from "@/components/account-context";
import { cn, money } from "@/lib/utils";

export function AccountSelect({
  value,
  onChange,
}: {
  value: Account;
  onChange: (a: Account) => void;
}) {
  const { accounts } = useAccount();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-md border border-line bg-raised px-3",
          "transition-colors duration-150 ease-out hover:border-line-strong",
          open && "border-line-strong",
        )}
      >
        <Wallet className="size-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left text-label font-medium text-ink">
          {value.name}
        </span>
        <span className="hidden text-label tnum text-ink-muted sm:block">
          {money(value.equity)}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-ink-muted transition-transform duration-150 ease-out",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Trading account"
          className="absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-md border border-line bg-overlay py-1 shadow-pop"
        >
          {accounts.map((a) => {
            const selected = a.id === value.id;
            return (
              <button
                key={a.id}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(a);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left",
                  "transition-colors duration-150 ease-out hover:bg-raised",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-medium text-ink">
                    {a.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-muted">
                    {a.broker} · since {a.since}
                  </span>
                </span>
                <span className="shrink-0 text-label tnum text-ink-secondary">
                  {money(a.equity)}
                </span>
                <Check
                  className={cn(
                    "size-4 shrink-0 text-accent",
                    !selected && "invisible",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
