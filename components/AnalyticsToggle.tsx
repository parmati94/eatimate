"use client";

import { useEffect, useState } from "react";

/**
 * The key the Umami tracker itself checks. Reading script.js: every send runs
 * `U()`, which short-circuits on `localStorage.getItem("umami.disabled")`, so
 * flipping this takes effect on the next event with no reload and no cache to
 * clear. Any non-empty value counts as disabled; the tracker never writes it.
 */
const KEY = "umami.disabled";

type State = "counting" | "opted-out" | "unavailable";

/**
 * Opt out of analytics, from the page that describes them.
 *
 * The setting lives in this browser's storage, which is the honest mechanism
 * and also its limit: it cannot follow someone to another device, and saying
 * so on the control is better than letting the word "off" imply an account.
 *
 * Renders a placeholder until mounted. The answer is in localStorage, which
 * the server cannot read, so any guess is a wrong first paint -- the same
 * reason ThemeToggle waits. Storage can also be absent or blocked entirely
 * (private windows, storage disabled), and that is reported rather than shown
 * as a switch that silently does nothing.
 */
export default function AnalyticsToggle() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from storage after mount
      setState(localStorage.getItem(KEY) ? "opted-out" : "counting");
    } catch {
      setState("unavailable");
    }
  }, []);

  function toggle() {
    try {
      const next = state === "counting" ? "opted-out" : "counting";
      if (next === "opted-out") localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
      setState(next);
    } catch {
      setState("unavailable");
    }
  }

  return (
    <div className="mt-2 rounded-2xl border border-line bg-surface p-4">
      {state === null ? (
        // Same height as the real control, so the paragraph below it does not
        // jump when this resolves.
        <div className="min-h-11" />
      ) : state === "unavailable" ? (
        <p className="text-sm text-muted">
          Your browser is blocking site storage, so this switch has nothing to
          write to. Analytics that rely on storage are not recording you either.
        </p>
      ) : (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={state === "counting"}
            onClick={toggle}
            className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="text-sm font-medium">
              Count my visits on this device
            </span>
            <span
              aria-hidden
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                state === "counting"
                  ? "border-accent bg-accent"
                  : "border-line bg-surface-2"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform ${
                  state === "counting" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>
          <p className="mt-1 text-xs text-muted">
            {state === "counting"
              ? "You are included in the anonymous counts described above."
              : "You are not being counted. Nothing is recorded from this browser."}{" "}
            This is stored in this browser only, so it does not carry to your
            other devices, and clearing site data resets it.
          </p>
        </>
      )}
    </div>
  );
}
