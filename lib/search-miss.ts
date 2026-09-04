"use client";

import { useEffect, useRef } from "react";
import { track, type EventData } from "./analytics";

/**
 * Report a search that found nothing -- once it has SETTLED, never per key.
 *
 * The one shared implementation on purpose. search-opened was once wired to a
 * field's onChange as well as its onFocus and so fired once per character, and
 * this event is strictly more dangerous: it is driven by the query itself, so
 * a naive version sends "c", "ch", "chi", "chic"... and buries the one term
 * that mattered under its own prefixes. Anything that wants to count a miss
 * goes through here.
 *
 * How the debounce actually holds: the effect re-runs on every keystroke,
 * because the trimmed term is a dependency, and its cleanup cancels the timer
 * the previous keystroke armed. A timer therefore only ever reaches its
 * callback if the field sat still for SETTLE_MS. That is also the moment the
 * event is about -- someone looking at "nothing matches", not someone still
 * typing towards a word.
 *
 * Terms already reported are remembered for the life of the component, so
 * backspacing into a miss and out of it again does not send it twice. The one
 * duplicate this cannot prevent is a person who pauses for more than a second
 * mid-word: "chick" settles, then "chicken" settles, and both are real
 * observations of a real miss, so both are sent.
 */
const SETTLE_MS = 1200;
/** Under three characters a miss is the start of a word, not a gap. */
const MIN_LENGTH = 3;

export function useSearchMiss(query: string, missing: boolean, data: EventData) {
  // The properties can change identity every render (they are built inline at
  // the call site), so they are read at fire time rather than depended on --
  // a dependency here would rearm the timer on renders that changed nothing.
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });

  const reported = useRef<Set<string>>(new Set());
  const term = query.trim().toLowerCase();

  useEffect(() => {
    if (!missing || term.length < MIN_LENGTH) return;
    const timer = setTimeout(() => {
      if (reported.current.has(term)) return;
      reported.current.add(term);
      track("search-empty", { ...latest.current, term });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term, missing]);
}
