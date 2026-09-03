import { describe, expect, it } from "vitest";
import { displayName, possessive, readableCase } from "./text";

describe("possessive", () => {
  it("adds 's to an ordinary name", () => {
    expect(possessive("Chipotle")).toBe("Chipotle’s");
    expect(possessive("CAVA")).toBe("CAVA’s");
    expect(possessive("Moe's Southwest Grill")).toBe("Moe's Southwest Grill’s");
  });

  it("leaves a name that is already possessive alone", () => {
    // The bug this replaced: "Domino's's published data" on every Domino's and
    // Papa John's page, in the footer, the nutrition table, the compare
    // footnote, the OG card and the meta description.
    expect(possessive("Domino's")).toBe("Domino's");
    expect(possessive("Papa John's")).toBe("Papa John's");
  });

  it("handles a curly apostrophe the same as a straight one", () => {
    expect(possessive("Domino’s")).toBe("Domino’s");
  });

  it("gives a plural name a bare apostrophe", () => {
    expect(possessive("Five Guys")).toBe("Five Guys’");
    expect(possessive("Buffalo Wild Wings")).toBe("Buffalo Wild Wings’");
    expect(possessive("Panda Express")).toBe("Panda Express’");
  });
});

describe("readableCase", () => {
  it("leaves mixed-case names alone", () => {
    expect(readableCase("Chick-fil-A® Nuggets")).toBe("Chick-fil-A® Nuggets");
    expect(readableCase("Ched 'R' Bites")).toBe("Ched 'R' Bites");
  });
  it("cases an all-caps name word by word", () => {
    expect(readableCase("ALL-AMERICAN BACON SONIC SMASHER™ (DOUBLE)")).toBe(
      "All-American Bacon Sonic Smasher™ (Double)",
    );
    expect(readableCase("BARQ’S® ROOT BEER FLOAT, SMALL")).toBe("Barq’s® Root Beer Float, Small");
    expect(readableCase("SONIC BLAST® WITH OREO® COOKIE PIECES")).toBe(
      "Sonic Blast® with Oreo® Cookie Pieces",
    );
    expect(readableCase("THE J.J. GARGANTUAN")).toBe("The J.J. Gargantuan");
  });
  it("keeps initialisms and brand marks as printed", () => {
    expect(readableCase("BBQ")).toBe("BBQ");
    expect(readableCase("J.J.B.L.T.")).toBe("J.J.B.L.T.");
    expect(readableCase("RT 44®")).toBe("RT 44®");
    expect(readableCase("SONIC BLAST® WITH M&M’S® MINIS CHOCOLATE CANDIES")).toBe(
      "Sonic Blast® with M&M’S® Minis Chocolate Candies",
    );
    expect(readableCase("DIET DR PEPPER®")).toBe("Diet Dr Pepper®");
    expect(readableCase("JR BACON CHEESEBURGER")).toBe("Jr Bacon Cheeseburger");
    expect(readableCase("EZ")).toBe("EZ");
    expect(readableCase("1% WHITE MILK")).toBe("1% White Milk");
  });
});

describe("displayName", () => {
  it("drops the chain's own ® prefix", () => {
    expect(displayName("Chick-fil-A® Nuggets", "Chick-fil-A")).toBe("Nuggets");
    expect(displayName("Chick-fil-A® Filet", "Chick-fil-A")).toBe("Filet");
    expect(displayName("SONIC® CHEESEBURGER WITH KETCHUP & MAYO", "Sonic")).toBe(
      "Cheeseburger with Ketchup & Mayo",
    );
  });
  it("keeps a bare chain-name prefix, and a name that is only the prefix", () => {
    expect(displayName("Chipotle Honey Chicken", "Chipotle")).toBe("Chipotle Honey Chicken");
    expect(displayName("Subway Club®", "Subway")).toBe("Subway Club®");
    expect(displayName("Five Guys Style Fries", "Five Guys")).toBe("Five Guys Style Fries");
    expect(displayName("Whataburger®", "Whataburger")).toBe("Whataburger®");
    expect(displayName("Chick-fil-A Chick-n-Strips®", "Chick-fil-A")).toBe("Chick-fil-A Chick-n-Strips®");
    expect(displayName("SONIC BLAST® WITH HEATH TOFFEE PIECES", "Sonic")).toBe(
      "Sonic Blast® with Heath Toffee Pieces",
    );
  });
});
