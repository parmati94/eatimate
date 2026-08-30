"use client";

import { useEffect, useState } from "react";
import { IconMonitor, IconMoon, IconSun } from "./icons";

export type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
export const THEME_KEY = "mealmath.theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  // Keep the browser chrome color in sync with a manual override.
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => (m.content = dark ? "#0e0f11" : "#f7f7f5"));
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from storage after mount
      if (saved && ORDER.includes(saved)) setTheme(saved);
    } catch {}
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {}
  }

  const label =
    theme === "system"
      ? "Theme: system (tap for light)"
      : theme === "light"
        ? "Theme: light (tap for dark)"
        : "Theme: dark (tap for system)";
  const Icon =
    theme === "system" ? IconMonitor : theme === "light" ? IconSun : IconMoon;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
