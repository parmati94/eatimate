"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { pageview } from "@/lib/analytics";

/**
 * Umami Cloud, loaded from Umami and driven by hand.
 *
 * Loaded from their domain rather than proxied through ours, which is the
 * opposite of what a first-party path would buy and was measured rather than
 * assumed. A Next rewrite to an external URL proxies SERVER-side: the browser
 * posts to us and we post onward, so Umami sees this origin's IP for every
 * visitor on earth. That is not only a wrong city -- Umami's session id is a
 * hash including the IP, so with it held constant two visitors sharing a user
 * agent and a screen size collapse into one session, and "did a visit become a
 * meal" is a ratio whose denominator we would have broken. Self-hosted Umami
 * has CLIENT_IP_HEADER for exactly this; on Cloud there is no equivalent.
 *
 * The cost is the visitors whose blocklists carry umami.is. That loss is a
 * minority of a mobile audience and it is unbiased, which is the better of the
 * two errors.
 *
 * data-auto-track is OFF, and that single attribute is doing two jobs. Reading
 * script.js: `M && !U() && z()` is the whole of the tracker's automatic
 * behaviour, and z() both sends the first pageview AND wraps history.pushState
 * and history.replaceState. The builder rewrites the URL on a debounce as the
 * meal changes, so left automatic, one person building one meal reports as a
 * dozen pageviews at a dozen distinct URLs -- the same failure the Cloudflare
 * beacon has spelled out beside it in layout.tsx, and the reason that URL sync
 * is debounced at all. With it off, nothing is counted that we did not count
 * on purpose, and a pageview means a navigation again.
 *
 * window.umami is assigned regardless of that flag, so events still work; the
 * cost is that the first pageview is now ours to send, hence onLoad below.
 *
 * The website id arrives as a prop, read from the environment by the server
 * layout -- the same shape CF_BEACON_TOKEN uses, and for the same reason: the
 * pages are prerendered, so the layout reads the environment at IMAGE BUILD
 * time and never again. UMAMI_WEBSITE_ID is therefore a build arg (Dockerfile,
 * and vars.UMAMI_WEBSITE_ID in the workflow), NOT a variable on the running
 * container -- setting it there looks right, changes nothing, and is worth
 * knowing before debugging a tracker that never appears. Unset, no tracker is
 * rendered, which is how development stays out of the numbers.
 */
export default function Analytics({ id }: { id: string }) {
  const pathname = usePathname();
  // Until the script has run there is no window.umami to call, and a pageview
  // sent into the void is a lost landing rather than a late one.
  const ready = useRef(false);

  useEffect(() => {
    if (ready.current) pageview(pathname);
  }, [pathname]);

  return (
    <Script
      src="https://cloud.umami.is/script.js"
      strategy="afterInteractive"
      data-website-id={id}
      // No data-host-url: the tracker then posts to its own default,
      // gateway.umami.is, straight from the browser -- which is the point, since
      // that request carries the visitor's IP rather than ours.
      data-auto-track="false"
      // Belt and braces against the meal leaking into the numbers: pageview()
      // already overrides the URL, and this makes the tracker's own default
      // drop the query string too, so no path through the code can send ?m=.
      data-exclude-search="true"
      // Honour the browser's Do Not Track signal. Costs us a slice of the
      // numbers; it is the setting a site that says what ours says should have.
      data-do-not-track="true"
      onLoad={() => {
        ready.current = true;
        // Read the location now rather than closing over the pathname from
        // first render: if someone navigated while the script was still in
        // flight, that render's value is already stale.
        pageview(window.location.pathname);
      }}
    />
  );
}
