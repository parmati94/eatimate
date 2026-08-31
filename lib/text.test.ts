import { describe, expect, it } from "vitest";
import { possessive } from "./text";

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
