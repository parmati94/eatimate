import { describe, expect, it } from "vitest";
import {
  pctDV,
  roundCalories,
  roundCholesterol,
  roundFat,
  roundGrams,
  roundSodium,
} from "./rounding";

// 21 CFR 101.9(c). These are the rules the label is legally rounded by, so the
// boundaries are the whole point -- a value ON a threshold is the interesting case.
describe("roundCalories", () => {
  it("reports under 5 as zero", () => {
    expect(roundCalories(0)).toBe(0);
    expect(roundCalories(4.9)).toBe(0);
  });
  it("rounds to the nearest 5 up to 50", () => {
    expect(roundCalories(5)).toBe(5);
    expect(roundCalories(12)).toBe(10);
    expect(roundCalories(13)).toBe(15);
    expect(roundCalories(50)).toBe(50);
  });
  it("rounds to the nearest 10 above 50", () => {
    expect(roundCalories(51)).toBe(50);
    expect(roundCalories(56)).toBe(60);
    expect(roundCalories(1520)).toBe(1520);
  });
});

describe("roundFat", () => {
  it("reports under 0.5 g as zero", () => {
    expect(roundFat(0.4)).toBe(0);
  });
  it("rounds to the nearest half gram under 5 g", () => {
    expect(roundFat(0.5)).toBe(0.5);
    expect(roundFat(2.3)).toBe(2.5);
    expect(roundFat(4.9)).toBe(5);
  });
  it("rounds to the nearest gram at or above 5 g", () => {
    expect(roundFat(5)).toBe(5);
    expect(roundFat(26.4)).toBe(26);
  });
});

describe("roundGrams", () => {
  it("reports under 0.5 g as zero and under 1 g as 1", () => {
    expect(roundGrams(0.4)).toBe(0);
    expect(roundGrams(0.6)).toBe(1);
  });
  it("rounds to whole grams", () => {
    expect(roundGrams(41.4)).toBe(41);
    expect(roundGrams(41.5)).toBe(42);
  });
});

describe("roundCholesterol", () => {
  it("reports under 2 mg as zero and 2-5 mg as 5", () => {
    expect(roundCholesterol(1.9)).toBe(0);
    expect(roundCholesterol(2)).toBe(5);
    expect(roundCholesterol(5)).toBe(5);
  });
  it("rounds to the nearest 5 mg above that", () => {
    expect(roundCholesterol(13)).toBe(15);
  });
});

describe("roundSodium", () => {
  it("reports under 5 mg as zero", () => {
    expect(roundSodium(4)).toBe(0);
  });
  it("rounds to the nearest 5 mg up to 140", () => {
    expect(roundSodium(63)).toBe(65);
    expect(roundSodium(140)).toBe(140);
  });
  it("rounds to the nearest 10 mg above 140", () => {
    expect(roundSodium(141)).toBe(140);
    expect(roundSodium(1935)).toBe(1940);
  });
});

describe("pctDV", () => {
  it("is a whole percentage of the FDA daily value", () => {
    expect(pctDV("sodium_mg", 2300)).toBe(100);
    expect(pctDV("fat_g", 39)).toBe(50);
  });
});
