import { describe, expect, it } from "vitest";
import { MEAL_BUILT_AT, newFunnel, onClear, onEnd, onPick, type FunnelState } from "./funnel";

/** Drive a run of picks, returning the events each produced. */
function run(
  s: FunnelState,
  picks: { replaces?: boolean; already?: boolean }[],
  from = 0,
) {
  let count = from;
  const out: { started: boolean; built: boolean; count: number }[] = [];
  for (const p of picks) {
    const r = onPick(s, {
      countBefore: count,
      already: !!p.already,
      replaces: !!p.replaces,
    });
    s = r.state;
    if (!p.already) count += p.replaces ? 0 : 1;
    else count -= 1;
    out.push({ started: r.started, built: r.built, count });
  }
  return { state: s, events: out, count };
}

describe("meal-started", () => {
  it("fires on the first pick and not on later ones", () => {
    const { events } = run(newFunnel(), [{}, {}, {}]);
    expect(events.map((e) => e.started)).toEqual([true, false, false]);
  });

  it("does not fire when a pick REMOVES something", () => {
    const { events } = run(newFunnel(), [{ already: true }]);
    expect(events[0].started).toBe(false);
  });
});

describe("meal-built", () => {
  it(`fires once, on the pick that reaches ${MEAL_BUILT_AT}`, () => {
    const { events } = run(newFunnel(), [{}, {}, {}, {}, {}]);
    expect(events.map((e) => e.built)).toEqual([false, false, true, false, false]);
  });

  it("does not count a swap as growth", () => {
    // Bread, then swapping bread twice, then two more: the swaps do not move
    // the count, so the third REAL pick is what completes the meal.
    const { events, count } = run(newFunnel(), [
      {},
      { replaces: true },
      { replaces: true },
      {},
      {},
    ]);
    expect(count).toBe(3);
    expect(events.map((e) => e.built)).toEqual([false, false, false, false, true]);
  });

  it("fires AGAIN for a meal built after clearing — the bug this file exists for", () => {
    const first = run(newFunnel(), [{}, {}, {}]);
    expect(first.events.filter((e) => e.built)).toHaveLength(1);

    // Clear, then build another. Before the fix the ref stayed latched for the
    // life of the mount, so this second meal was invisible and the visitor
    // read as two starts against one build.
    const second = run(onClear(first.state), [{}, {}, {}], 0);
    expect(second.events.map((e) => e.started)).toEqual([true, false, false]);
    expect(second.events.filter((e) => e.built)).toHaveLength(1);
  });

  it("still fires only once within one uncleared meal", () => {
    const { events } = run(newFunnel(), [{}, {}, {}, {}, {}, {}, {}]);
    expect(events.filter((e) => e.built)).toHaveLength(1);
  });
});

describe("meal-final", () => {
  it("reports the size the meal actually reached, not the threshold", () => {
    const { state, count } = run(newFunnel(), [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
    expect(count).toBe(10);
    // The whole point: meal-built said 3 here, every time, for every meal.
    expect(onEnd(state, count).items).toBe(10);
  });

  it("sends nothing for an empty meal", () => {
    expect(onEnd(newFunnel(), 0).items).toBeNull();
  });

  it("does not repeat the same size when a tab is left and returned to", () => {
    const a = onEnd(newFunnel(), 5);
    expect(a.items).toBe(5);
    const b = onEnd(a.state, 5);
    expect(b.items).toBeNull();
  });

  it("reports again once the meal has actually changed", () => {
    const a = onEnd(newFunnel(), 5);
    const b = onEnd(a.state, 8);
    expect(b.items).toBe(8);
  });

  it("survives a clear, because it guards one VISIT and not one meal", () => {
    const a = onEnd(newFunnel(), 4);
    const cleared = onClear(a.state);
    expect(onEnd(cleared, 4).items).toBeNull();
    expect(onEnd(cleared, 6).items).toBe(6);
  });
});
