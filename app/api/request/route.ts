import { parseRequest, requestEmail } from "@/lib/request";

/**
 * Restaurant requests, delivered as an email to the maintainer.
 *
 * Sent through Resend, which is verified for eatimate.app (DKIM, SPF on the
 * send. subdomain, DMARC); mail sent straight from this server would land in
 * spam. RESEND_API_KEY and REQUEST_TO are RUNTIME variables on the container
 * -- unlike UMAMI_WEBSITE_ID, this route reads them per request, so the image
 * needs no rebuild to change them and neither ever enters the repo.
 *
 * Abuse handling is deliberately small: a honeypot and a minimum fill time in
 * parseRequest, and a per-address cap here. One container, so an in-memory
 * map is the whole rate limiter; a restart forgets it, which is fine.
 */

const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 5;
const seen = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_WINDOW) {
    seen.set(ip, recent);
    return true;
  }
  recent.push(now);
  seen.set(ip, recent);
  // Keep the map from growing without bound on a long-lived process.
  if (seen.size > 5000) seen.clear();
  return false;
}

const json = (body: object, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.REQUEST_TO;
  if (!key || !to) {
    return json({ error: "Requests aren't switched on here yet." }, 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Nothing was sent." }, 400);
  }

  const parsed = parseRequest(body);
  if (parsed.ok === "drop") return json({ ok: true });
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  // Cloudflare -> Caddy -> here, so the visitor is in CF-Connecting-IP.
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  if (limited(ip)) {
    return json({ error: "That's a lot of requests at once. Try again in a bit." }, 429);
  }

  const mail = requestEmail(parsed.value);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Eatimate <requests@eatimate.app>",
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    console.error("request email failed", res.status, await res.text().catch(() => ""));
    return json({ error: "It didn't go through on our end. Please try again." }, 502);
  }
  return json({ ok: true });
}
