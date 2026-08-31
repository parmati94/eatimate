"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

export type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
export const THEME_KEY = "eatimate.theme";

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

/**
 * Cycles system → light → dark.
 *
 * Shows the appearance you are *in* (sun or moon) rather than the mechanism you
 * are using. The old default state drew a monitor, which reads as cast-to-
 * screen far more readily than it reads as "theme"; following the system is now
 * a dot under the icon instead of an icon of its own.
 *
 * The icon renders only after mount: which one is correct depends on the OS
 * setting, which the server cannot know, and guessing means a wrong icon on
 * first paint. The button keeps its size throughout, so nothing shifts.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [systemDark, setSystemDark] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from storage after mount
      if (saved && ORDER.includes(saved)) setTheme(saved);
    } catch {}
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
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
      ? "Theme: following your system (tap for light)"
      : theme === "light"
        ? "Theme: light (tap for dark)"
        : "Theme: dark (tap for system)";
  const dark = theme === "dark" || (theme === "system" && systemDark === true);
  const Icon = dark ? IconMoon : IconSun;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
    >
      {systemDark === null ? (
        <span className="h-5 w-5" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
      {/* Following the system, rather than pinned to one appearance. */}
      {theme === "system" && systemDark !== null && (
        <span
          aria-hidden
          className="absolute bottom-1.5 h-1 w-1 rounded-full bg-current"
        />
      )}
    </button>
  );
}
