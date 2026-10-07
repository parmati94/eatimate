import { describe, expect, it } from "vitest";
import { fieldErrors, MIN_FILL_MS, parseRequest, requestEmail } from "./request";

const ok = { restaurant: "Sweetgreen", elapsed: MIN_FILL_MS + 1 };

describe("parseRequest", () => {
  it("accepts a bare restaurant name", () => {
    expect(parseRequest(ok)).toEqual({ ok: true, value: { restaurant: "Sweetgreen" } });
  });

  it("drops a filled honeypot or a too-fast submit, without saying why", () => {
    expect(parseRequest({ ...ok, website: "http://spam" })).toEqual({ ok: "drop" });
    expect(parseRequest({ ...ok, elapsed: 300 })).toEqual({ ok: "drop" });
    expect(parseRequest({ restaurant: "Sweetgreen" })).toEqual({ ok: "drop" });
  });

  it("asks for a restaurant when there is none", () => {
    expect(parseRequest({ ...ok, restaurant: "  " })).toMatchObject({ ok: false });
    expect(parseRequest(null)).toMatchObject({ ok: false });
  });

  it("rejects a malformed email but allows none", () => {
    expect(parseRequest({ ...ok, email: "not-an-email" })).toMatchObject({ ok: false });
    expect(parseRequest({ ...ok, email: "" })).toMatchObject({ ok: true });
  });

  it("rejects an email whose domain ending is too short to exist", () => {
    for (const bad of ["ddd@gmail.c", "x.com", "a@b", "a@.com", "a@b..com"]) {
      expect(fieldErrors({ restaurant: "X1", email: bad }).email, bad).toBeDefined();
    }
    for (const good of ["ddd@gmail.com", "a.b+c@mail.co.uk", "x@eatimate.app"]) {
      expect(fieldErrors({ restaurant: "X1", email: good }), good).toEqual({});
    }
  });

  it("keeps single-line fields on one line, so the subject cannot be split", () => {
    const r = parseRequest({ ...ok, restaurant: "Sweet\r\ngreen\tBcc: x" });
    expect(r).toMatchObject({ ok: true, value: { restaurant: "Sweet green Bcc: x" } });
  });

  it("caps field lengths", () => {
    const r = parseRequest({ ...ok, restaurant: "x".repeat(500), note: "y".repeat(2000) });
    if (r.ok !== true) throw new Error("expected ok");
    expect(r.value.restaurant).toHaveLength(80);
    expect(r.value.note).toHaveLength(500);
  });

  it("only keeps a same-site path as the page it came from", () => {
    expect(parseRequest({ ...ok, from: "/about" })).toMatchObject({ value: { from: "/about" } });
    expect(parseRequest({ ...ok, from: "https://evil.example" })).toMatchObject({
      value: { from: undefined },
    });
  });
});

describe("requestEmail", () => {
  it("puts the restaurant in the subject and the visitor in reply-to", () => {
    const m = requestEmail({ restaurant: "Sweetgreen", city: "Ashburn", email: "a@b.co", from: "/" });
    expect(m.subject).toBe("Restaurant request: Sweetgreen");
    expect(m.replyTo).toBe("a@b.co");
    expect(m.text).toContain("City: Ashburn");
  });

  it("says when no reply address was left", () => {
    expect(requestEmail({ restaurant: "Sweetgreen" }).text).toContain("(none left)");
  });

  it("escapes what the visitor typed in the HTML part", () => {
    const m = requestEmail({ restaurant: "<script>x</script>", note: 'a "b" & c' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("a &quot;b&quot; &amp; c");
  });
});
