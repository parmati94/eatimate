// When the builder's funnel events fire, as pure transitions over explicit
// state.
//
// Pulled out of MealBuilder for the same reason flow.ts was: these are
// LIFECYCLE bugs, not logic ones, and the only way to catch them inside an
// 800-line client component was to click through a browser and read a
// dashboard the next day. Two got through that way:
//
//   * `meal-built` latched on a ref that was never reset, so clearing the
//     meal and building another gave two `meal-started` and one `meal-built`.
//     The completion rate was understated, and understated WORST for the most
//     engaged visitor -- the one who builds, clears, and builds again.
//   * its `items` count was read at the moment the threshold was crossed, so
//     it was always exactly MEAL_BUILT_AT. A ten-item meal reported three.
//     We had no meal-size data at all and did not know it.
//
// So size moved to its own event, fired when the visit ends, and everything
// here is a function of state you can hand it.

/** A meal that reached this many components is one somebody used, not one they
 *  poked at. Paired with meal-started it gives a completion rate. */
export const MEAL_BUILT_AT = 3;

export interface FunnelState {
  /** meal-built has fired for the meal currently being built. */
  built: boolean;
  /** The size meal-final last reported, so returning to a tab does not send
   *  the same number again. -1 means nothing sent yet. */
  reported: number;
}

export const newFunnel = (): FunnelState => ({ built: false, reported: -1 });

export interface Pick {
  /** Selections before this pick. */
  countBefore: number;
  /** This component is already selected, i.e. the pick REMOVES it. */
  already: boolean;
  /** A single-select pick that replaces a sibling, so the count does not grow.
   *  Without this, swapping bread reads as the meal getting bigger. */
  replaces: boolean;
}

/** Events a pick produces, in the order they should be sent. */
export function onPick(s: FunnelState, p: Pick): {
  state: FunnelState;
  started: boolean;
  built: boolean;
} {
  // Removing something is never the start of a meal, and never completes one.
  if (p.already) return { state: s, started: false, built: false };
  const started = p.countBefore === 0;
  const after = p.countBefore + (p.replaces ? 0 : 1);
  const built = !s.built && after >= MEAL_BUILT_AT;
  return {
    state: built ? { ...s, built: true } : s,
    started,
    built,
  };
}

/** Clearing the meal. The next pick starts a NEW meal, which can complete on
 *  its own -- that is the reset the old ref never had. `reported` deliberately
 *  survives: it guards a duplicate size for one VISIT, not one meal. */
export function onClear(s: FunnelState): FunnelState {
  return { ...s, built: false };
}

/**
 * The end of the visit, which is the only honest moment to read meal size:
 * a builder has no "done" button, so any earlier reading is a guess at when
 * someone stopped.
 *
 * Returns null when there is nothing worth sending -- an empty meal, or a size
 * already reported, which is what a tab switched away from and back would
 * otherwise send twice.
 */
export function onEnd(s: FunnelState, count: number): {
  state: FunnelState;
  items: number | null;
} {
  if (count === 0 || count === s.reported) return { state: s, items: null };
  return { state: { ...s, reported: count }, items: count };
}
