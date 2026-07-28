"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, LifeBuoy, Settings, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// Only routes that actually exist. Adding an item here without a matching
// page under src/app will 404 on click.
const primary = [
  { icon: LayoutGrid, label: "Dashboard", href: "/" },
  { icon: BarChart3, label: "Analytics", href: "/analytics" },
  { icon: Wallet, label: "Accounts", href: "/accounts" },
];

const secondary = [
  { icon: LifeBuoy, label: "Support", href: "/support" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

function NavItem({
  icon: Icon,
  label,
  href,
  active,
}: {
  icon: typeof LayoutGrid;
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex size-10 items-center justify-center rounded-md",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-overlay hover:text-ink",
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className="sr-only">{label}</span>

      {/* Active rail marker — state is not carried by colour alone. */}
      {active && (
        <span
          className="absolute -left-3 h-5 w-0.5 rounded-full bg-accent"
          aria-hidden
        />
      )}

      {/* The rail is icon-only, so every item needs a hover label. */}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-full z-50 ml-3 rounded-md border border-line",
          "bg-overlay px-2 py-1 text-label whitespace-nowrap text-ink shadow-pop",
          "opacity-0 transition-opacity duration-150 ease-out",
          "group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center border-r border-line bg-surface py-5 sm:flex"
    >
      <Link
        href="/"
        className="mb-7 flex size-9 items-center justify-center rounded-md bg-accent-soft"
      >
        <svg viewBox="0 0 24 24" className="size-[19px]" aria-label="Risk Driver">
          <path
            d="M4 16a8 8 0 0 1 16 0"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 16 16.5 10.5"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </Link>

      <div className="flex flex-col gap-1">
        {primary.map((item) => (
          <NavItem key={item.label} {...item} active={isActive(item.href)} />
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3">
        <div className="flex flex-col gap-1">
          {secondary.map((item) => (
            <NavItem key={item.label} {...item} active={isActive(item.href)} />
          ))}
        </div>
      </div>
    </nav>
  );
}
