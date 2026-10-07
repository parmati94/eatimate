/**
 * A restaurant request: what the form sends, what the server accepts, and the
 * email it turns into. Pure, so the rules are tested without a server or a
 * mail provider; app/api/request/route.ts is the only caller that sends.
 */

export const LIMITS = { restaurant: 80, city: 80, email: 254, note: 500 } as const;

/** Faster than this from opening the form to sending it is not a person. */
export const MIN_FILL_MS = 2500;

export interface RequestInput {
  restaurant: string;
  city?: string;
  email?: string;
  note?: string;
  /** The page the form was opened on, e.g. "/" or "/about". */
  from?: string;
}

export type Parsed =
  | { ok: true; value: RequestInput }
  | { ok: false; error: string }
  /** Looks like a bot. Answered as a success so it learns nothing. */
  | { ok: "drop" };

// Single-line fields end up in a subject line: no newlines or control
// characters, and runs of whitespace collapse to one space.
function line(v: unknown, max: number): string {
  return typeof v === "string"
    ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function block(v: unknown, max: number): string {
  return typeof v === "string"
    ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max)
    : "";
}

// A domain with a real-looking ending: "ddd@gmail.c" used to pass a looser
// check, then fail at the mail provider as an invalid reply-to, which told
// the visitor the request "didn't go through on our end".
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

export type FieldErrors = Partial<Record<"restaurant" | "email", string>>;

/**
 * What's wrong with what the visitor typed, field by field. The form shows
 * these under each field before sending, and the server applies the same
 * rules, so the two can never disagree about what is valid.
 */
export function fieldErrors(input: { restaurant?: unknown; email?: unknown }): FieldErrors {
  const out: FieldErrors = {};
  if (line(input.restaurant, LIMITS.restaurant).length < 2) {
    out.restaurant = "Which restaurant should we add?";
  }
  const email = line(input.email, LIMITS.email);
  if (email && !EMAIL.test(email)) {
    out.email = "That email address doesn't look right. Check it, or leave it blank.";
  }
  return out;
}

export function parseRequest(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "Nothing was sent." };
  const b = body as Record<string, unknown>;

  // The honeypot: a field people never see, so only a form-filling bot fills
  // it. And a form completed faster than anyone can type is the same thing.
  if (typeof b.website === "string" && b.website !== "") return { ok: "drop" };
  if (typeof b.elapsed !== "number" || b.elapsed < MIN_FILL_MS) return { ok: "drop" };

  const errors = fieldErrors(b);
  const first = errors.restaurant ?? errors.email;
  if (first) return { ok: false, error: first };

  const restaurant = line(b.restaurant, LIMITS.restaurant);
  const email = line(b.email, LIMITS.email);

  const from = line(b.from, 200);
  return {
    ok: true,
    value: {
      restaurant,
      city: line(b.city, LIMITS.city) || undefined,
      email: email || undefined,
      note: block(b.note, LIMITS.note) || undefined,
      from: from.startsWith("/") ? from : undefined,
    },
  };
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The email, as plain text and as HTML. Gmail shows the HTML; the text part
 * is what a notification preview and any text-only client read. Inline styles
 * only, because mail clients drop <style> blocks and every class name.
 */
export function requestEmail(r: RequestInput) {
  const rows = [
    `Restaurant: ${r.restaurant}`,
    r.city && `City: ${r.city}`,
    r.email ? `Reply to: ${r.email}` : "Reply to: (none left)",
    r.from && `Sent from: ${r.from}`,
    r.note && `\n${r.note}`,
  ].filter(Boolean);

  // The first thing to do with a request is find out whether the chain
  // publishes nutrition at all, so the email starts that search.
  const search = `https://www.google.com/search?q=${encodeURIComponent(
    `${r.restaurant} nutrition information pdf`,
  )}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top"><b>${label}</b></td>` +
    `<td style="padding:6px 0;font-size:15px;color:#111827">${value}</td></tr>`;
  const details = [
    r.city && row("City", esc(r.city)),
    row(
      "Reply to",
      r.email
        ? `<a href="mailto:${esc(r.email)}" style="color:#0f766e">${esc(r.email)}</a>`
        : `<span style="color:#9ca3af">none left</span>`,
    ),
    r.from && row("Sent from", `<code style="font-size:13px">${esc(r.from)}</code>`),
  ].filter(Boolean);

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb">
<tr><td style="padding:24px 24px 8px">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e;font-weight:700">Eatimate · Restaurant request</div>
<div style="font-size:26px;font-weight:800;color:#111827;margin-top:6px;line-height:1.2">${esc(r.restaurant)}</div>
</td></tr>
<tr><td style="padding:8px 24px 4px"><table role="presentation" cellpadding="0" cellspacing="0">${details.join("")}</table></td></tr>
${
  r.note
    ? `<tr><td style="padding:12px 24px 4px"><div style="font-size:13px;color:#6b7280"><b>Note</b></div>
<div style="margin-top:6px;padding:10px 14px;border-left:3px solid #0f766e;background:#f0fdfa;color:#111827;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(r.note)}</div></td></tr>`
    : ""
}
<tr><td style="padding:20px 24px 24px">
<a href="${search}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:10px">Find their nutrition guide</a>
</td></tr>
</table>
<div style="max-width:520px;margin:12px auto 0;font-size:12px;color:#9ca3af;text-align:center">Sent by the request form on eatimate.app${r.email ? " · Reply to answer them directly" : ""}</div>
</body></html>`;

  return {
    subject: `Restaurant request: ${r.restaurant}`,
    text: rows.join("\n") + "\n",
    html,
    replyTo: r.email,
  };
}
