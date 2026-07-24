"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { AccountSelect } from "@/components/dashboard/account-select";
import type { Account } from "@/lib/data";

/** Per-route heading. The dashboard greets; every other page names itself. */
const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Welcome back, Teun", subtitle: "Thursday, 23 July" },
  "/analytics": {
    title: "Analytics",
    subtitle: "Performance and risk, broken down",
  },
  "/accounts": {
    title: "Accounts",
    subtitle: "Connect and manage your trading accounts",
  },
};

export function Header({
  account,
  onAccountChange,
}: {
  account: Account;
  onAccountChange: (a: Account) => void;
}) {
  const pathname = usePathname();
  const { title, subtitle } = TITLES[pathname] ?? {
    title: "Risk Driver",
    subtitle: "Thursday, 23 July",
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur-sm">
      <div className="flex h-16 items-center gap-4 px-6 lg:px-8">
        <div className="min-w-0 shrink-0">
          <h1 className="text-title whitespace-nowrap text-ink">{title}</h1>
          <p className="hidden text-label whitespace-nowrap text-ink-muted sm:block">
            {subtitle}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-[280px] md:block">
            <AccountSelect value={account} onChange={onAccountChange} />
          </div>

          <IconButton aria-label="Notifications — 2 unread" className="relative">
            <Bell aria-hidden />
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-accent ring-2 ring-base" />
          </IconButton>

          <div className="mx-1 h-6 w-px bg-line" aria-hidden />

          <button
            type="button"
            className="flex items-center gap-2 rounded-md py-1 pr-2 pl-1 transition-colors duration-150 ease-out hover:bg-overlay"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-ink-secondary">
              TB
            </span>
            <ChevronDown className="size-3.5 text-ink-muted" aria-hidden />
            <span className="sr-only">Open account menu</span>
          </button>
        </div>
      </div>

      {/* Below md the selector gets its own row rather than being dropped —
          it is the control that scopes the entire page. */}
      <div className="border-t border-line px-6 py-2.5 md:hidden">
        <AccountSelect value={account} onChange={onAccountChange} />
      </div>
    </header>
  );
}
