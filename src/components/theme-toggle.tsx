"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_KEY = "riskdriver.theme";

/**
 * Sun/moon switch for the icon rail. Dark is the default; the choice is
 * persisted and re-applied before paint by the inline script in layout.tsx,
 * so this component only has to keep state and flip the <html> class.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  // Sync with whatever the pre-hydration script applied.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only sync with the pre-applied html class
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "light" : "dark");
    } catch {
      /* private mode — theme just won't persist */
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      onClick={toggle}
      className={cn(
        "group relative flex h-6 w-11 items-center rounded-full border border-line bg-raised px-0.5",
        "transition-colors duration-150 ease-out hover:border-line-strong",
      )}
    >
      {/* Thumb slides between the two icons. Transform only — no layout work. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0.5 size-5 rounded-full bg-accent-soft",
          "transition-transform duration-200 ease-out",
          light ? "translate-x-0" : "translate-x-[19px]",
        )}
      />
      <span className="relative z-10 flex w-1/2 items-center justify-center">
        <Sun
          className={cn(
            "size-3 transition-colors duration-150 ease-out",
            light ? "text-accent" : "text-ink-muted",
          )}
          aria-hidden
        />
      </span>
      <span className="relative z-10 flex w-1/2 items-center justify-center">
        <Moon
          className={cn(
            "size-3 transition-colors duration-150 ease-out",
            light ? "text-ink-muted" : "text-accent",
          )}
          aria-hidden
        />
      </span>
    </button>
  );
}
